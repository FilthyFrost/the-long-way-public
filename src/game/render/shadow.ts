/**
 * Cast shadows from the key light (sun or moon), in two nested maps:
 *   near  a few metres around the vehicle — fine enough for the pillars to shadow the dash
 *   far   ~90 m around it — trees, poles and the vehicle itself on the road
 * Both follow the camera in whole-texel steps so shadows do not shimmer while driving.
 */
import * as THREE from 'three';
import { GLSL_LEAF_COVER } from './materials';
import { globals } from './shaderlib';
import { sharedTextures } from './textures';

export const LAYER_SHADOW_FAR = 1;
export const LAYER_SHADOW_NEAR = 2;

class Cascade {
  readonly target: THREE.WebGLRenderTarget;
  readonly camera: THREE.OrthographicCamera;
  readonly matrix = new THREE.Matrix4();
  constructor(
    readonly size: number,
    readonly radius: number,
    readonly depth: number,
    layer: number,
  ) {
    this.target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, stencilBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const dt = new THREE.DepthTexture(size, size);
    dt.minFilter = THREE.NearestFilter;
    dt.magFilter = THREE.NearestFilter;
    this.target.depthTexture = dt;
    this.camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.5, depth * 2);
    this.camera.layers.set(layer);
  }
}

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const tmp = new THREE.Vector3();
const up = new THREE.Vector3();
const lightPos = new THREE.Vector3();
const inv = new THREE.Matrix4();

export class ShadowPass {
  readonly near: Cascade;
  readonly far: Cascade;
  private readonly depthMat: THREE.ShaderMaterial;
  enabled = true;

  constructor(size: number) {
    this.near = new Cascade(size, 5.5, 60, LAYER_SHADOW_NEAR);
    this.far = new Cascade(size, 92, 320, LAYER_SHADOW_FAR);
    this.depthMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      colorWrite: false,
      uniforms: { tLeaf: { value: sharedTextures().leaf } },
      vertexShader: /* glsl */ `
        // leaf cards cut their shadows out of the leaf texture (absent attribute = 0 = solid)
        attribute float aCard;
        varying float vCard;
        varying vec2 vUv;
        void main() {
          vCard = aCard;
          vUv = uv;
          mat4 m = modelMatrix;
          #ifdef USE_INSTANCING
          m = modelMatrix * instanceMatrix;
          #endif
          gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tLeaf;
        varying float vCard;
        varying vec2 vUv;
        ${GLSL_LEAF_COVER}
        void main() {
          float tone;
          if (vCard > 0.5 && rtLeafCover(tLeaf, vUv, tone) < 0.5) discard;
          gl_FragColor = vec4(1.0);
        }`,
    });
    globals.uShadowMap0.value = this.near.target.depthTexture;
    globals.uShadowMap1.value = this.far.target.depthTexture;
  }

  private place(c: Cascade, focus: THREE.Vector3, dir: THREE.Vector3): void {
    const cam = c.camera;
    // a stable basis around the light direction
    up.set(0, 1, 0);
    if (Math.abs(dir.y) > 0.98) up.set(1, 0, 0);
    lightPos.copy(focus).addScaledVector(dir, c.depth);
    cam.position.copy(lightPos);
    cam.up.copy(up);
    cam.lookAt(focus);
    cam.updateMatrixWorld(true);
    // snap the focus to whole texels in light space
    inv.copy(cam.matrixWorld).invert();
    tmp.copy(focus).applyMatrix4(inv);
    const texel = (c.radius * 2) / c.size;
    const sx = tmp.x - Math.round(tmp.x / texel) * texel;
    const sy = tmp.y - Math.round(tmp.y / texel) * texel;
    tmp.set(sx, sy, 0).transformDirection(cam.matrixWorld).multiplyScalar(Math.hypot(sx, sy));
    cam.position.sub(tmp);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    c.matrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).premultiply(BIAS);
  }

  /**
   * @param nearFocus centre of the fine map (the vehicle), render space
   * @param farFocus  centre of the wide map (a little ahead of the camera), render space
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, nearFocus: THREE.Vector3, farFocus: THREE.Vector3): void {
    const p = globals.uShadowParams.value;
    const dir = globals.uSunDir.value;
    // no shadows when the key light is negligible or the pass is off
    const strength = this.enabled ? Math.min(1, globals.uSunColor.value.r + globals.uSunColor.value.g + globals.uSunColor.value.b) : 0;
    if (strength < 0.02) {
      p.x = 0;
      return;
    }
    this.place(this.near, nearFocus, dir);
    this.place(this.far, farFocus, dir);
    globals.uShadowMat0.value.copy(this.near.matrix);
    globals.uShadowMat1.value.copy(this.far.matrix);
    p.set(1, (this.near.radius * 2) / this.near.size, (this.far.radius * 2) / this.far.size, 1 / this.near.size);
    const prev = scene.overrideMaterial;
    scene.overrideMaterial = this.depthMat;
    for (const c of [this.near, this.far]) {
      renderer.setRenderTarget(c.target);
      renderer.clear();
      renderer.render(scene, c.camera);
    }
    scene.overrideMaterial = prev;
    renderer.setRenderTarget(null);
  }
}

/** mark an object (and its children) as a shadow caster */
export function castShadows(obj: THREE.Object3D, near = false): void {
  obj.traverse((o) => {
    o.layers.enable(LAYER_SHADOW_FAR);
    if (near) o.layers.enable(LAYER_SHADOW_NEAR);
  });
}
