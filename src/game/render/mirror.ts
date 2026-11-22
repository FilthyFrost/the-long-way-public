/**
 * The mirror (G8, docs/V3/nodes/G-ghibli.md): the world upside down in a level sheet of still water — a salt pan's
 * film, a crater's lake. The scene is drawn once more from under the water's plane (the eye mirrored in it), at
 * half the frame's size, into a picture the water's own shader lays on itself: the sky with every cloud of it, the
 * ranges, the rim across the lake, the car on the causeway. Only while there is such a water in sight (`plane`), and one
 * plane at a time: the nearest water's.
 *
 * The mirrored eye is a camera like any other (its place, its aim and its up mirrored: three's Reflector's way), so
 * the scene's faces keep their winding; a point of the water finds its colour by that camera's own projection
 * (`mirrorUniforms.uMirror`: render space → the picture's uv). The land under the plane turns its back to an eye
 * below it and is not drawn: nothing need be clipped.
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from './shaderlib';

/** what a mirroring water's shader reads: the picture, the way into it, and whether it was drawn this frame */
export const mirrorUniforms = {
  tMirror: { value: null as THREE.Texture | null },
  uMirror: { value: new THREE.Matrix4() },
  uMirrorOn: { value: 0 },
};

export class MirrorPass {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly eye = new THREE.PerspectiveCamera();
  private readonly f = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly size = new THREE.Vector2();
  private readonly cut = new THREE.Plane();
  private readonly hidden: THREE.Object3D[] = [];
  private readonly reversed: boolean;
  /** the world height of the water to mirror (null: none in sight — nothing is drawn); whoever draws that water keeps it (scene/wonders.ts) */
  plane: number | null = null;
  /** drawn this frame (the harness asks) */
  drawn = false;

  constructor(reversed: boolean) {
    this.reversed = reversed;
    const depth = new THREE.DepthTexture(1, 1, reversed ? THREE.FloatType : THREE.UnsignedIntType);
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, colorSpace: THREE.NoColorSpace, depthBuffer: true, stencilBuffer: false, depthTexture: depth });
    mirrorUniforms.tMirror.value = this.target.texture;
  }

  /** draw the mirror if it was asked for; `originY`: the world height of render space's zero */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, originY: number): void {
    this.drawn = false;
    mirrorUniforms.uMirrorOn.value = 0;
    if (this.plane === null) return;
    const y0 = this.plane - originY;
    // (an eye under the water sees no mirror)
    if (camera.position.y <= y0 + 0.02) return;
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(2, Math.round(this.size.x * 0.5));
    const h = Math.max(2, Math.round(this.size.y * 0.5));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const eye = this.eye;
    eye.fov = camera.fov;
    eye.aspect = camera.aspect;
    eye.near = camera.near;
    eye.far = camera.far;
    eye.updateProjectionMatrix();
    camera.getWorldDirection(this.f);
    this.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    eye.position.set(camera.position.x, 2 * y0 - camera.position.y, camera.position.z);
    eye.up.set(this.up.x, -this.up.y, this.up.z);
    eye.lookAt(this.at.set(eye.position.x + this.f.x, eye.position.y - this.f.y, eye.position.z + this.f.z));
    eye.updateMatrixWorld(true);
    eye.matrixWorldInverse.copy(eye.matrixWorld).invert();
    // Nothing under the water is in the picture — the land's skirts hang there, the lake's bed lies there, and an eye
    // below the plane looks straight at them: the projection's near plane is laid on the water's (an oblique one —
    // clip z set to w less OBLIQUE times the height over the water, so what is under it falls before the near plane;
    // depth still runs one way along every ray of the eye; whatever stands 1 / OBLIQUE times higher over the water
    // than it is far ahead is cut off at the other end, which nothing is but what stands right over the eye).
    const cut = this.cut.set(UP, -y0).applyMatrix4(eye.matrixWorldInverse);
    const e = eye.projectionMatrix.elements;
    const sgn = this.reversed ? 1 : -1;
    e[2] = sgn * (e[3] - OBLIQUE * cut.normal.x);
    e[6] = sgn * (e[7] - OBLIQUE * cut.normal.y);
    e[10] = sgn * (e[11] - OBLIQUE * cut.normal.z);
    e[14] = sgn * (e[15] - OBLIQUE * cut.constant);
    eye.projectionMatrixInverse.copy(eye.projectionMatrix).invert();
    // (a water far under the eye — a crater's lake from its rim — mirrors the land and the sky, not what stands by the eye:
    // the car, the grass and the things of the roadside are left out of its picture; a pan's film at the eye's feet has all)
    const hidden = this.hidden;
    hidden.length = 0;
    if (camera.position.y - y0 > SMALL_FROM) {
      for (const o of scene.children) {
        if (o.visible && SMALL.test(o.name)) {
          o.visible = false;
          hidden.push(o);
        }
      }
    }
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, eye);
    renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    // render space → the picture's uv
    mirrorUniforms.uMirror.value.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(eye.projectionMatrix).multiply(eye.matrixWorldInverse);
    mirrorUniforms.uMirrorOn.value = 1;
    this.drawn = true;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** the scene's own things by the eye (by their names: the vehicles, the meadow, the roadside's), left out of the mirror of a water more than SMALL_FROM m under the eye */
const SMALL = /^(modcar:|meadow|forage|siteart|splashes|proving|Scenery)/;
const SMALL_FROM = 30;
/** how fast the mirror's depth runs with height over the water (see MirrorPass.render) */
const OBLIQUE = 0.3;

/** a mirroring water's fragment shader: the picture at a point of the plane, the plane tilted a little by `tilt` (the ripple's lean, per metre of the eye's distance) */
export const GLSL_MIRROR = /* glsl */ `
  uniform sampler2D tMirror;
  uniform mat4 uMirror;
  uniform float uMirrorOn;
  vec3 rtMirrorAt(vec3 pos, vec2 tilt) {
    vec4 q = uMirror * vec4(pos, 1.0);
    vec2 uv = q.xy / max(q.w, 1e-4) + tilt;
    return texture2D(tMirror, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
  }
`;

/**
 * A salt pan's sheet (scene/wonders.ts): the film of water standing on the salt, and the salt under it. aFilm = (the
 * film's depth over the salt here, m: none where the salt stands dry at the pan's edge; how fully the point lies on
 * the pan; 1 by the road, over its strip of land). Far off and at a glance it is the sky; near and looked down into, the white of the salt and the net of
 * its ridges show through it; where a slow noise says the crust stands proud it is dry, its polygons in the sun.
 */
export function panMaterial(dry: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals, ...mirrorUniforms, uDry: { value: dry } },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute vec3 aFilm;
      varying vec2 vFilm;
      void main() {
        vFilm = aFilm.xy;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        vPos = rtWorld.xyz;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
        // (the film lies a hand over the road's strip of land, whose depth is pulled towards the eye with distance,
        // render/terrainMaterials.ts: this a little more, or the strip shows through the water far off)
        float rtDist = length(rtWorld.xyz - cameraPosition);
        #if defined(USE_LOGARITHMIC_DEPTH_BUFFER)
        vFragDepth *= 1.0 - (0.0016 + 0.026 * smoothstep(120.0, 1500.0, rtDist)) * aFilm.z;
        #elif defined(USE_REVERSED_DEPTH_BUFFER)
        gl_Position.z /= 1.0 - (0.0016 + 0.026 * smoothstep(120.0, 1500.0, rtDist)) * aFilm.z;
        #endif
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      ${GLSL_MIRROR}
      uniform float uDry;
      varying vec2 vFilm;

      // the salt's polygons: how near the nearest ridge is, 0 on it … 1 in the middle of a pan (cells of one unit)
      float rtCrust(vec2 p) {
        vec2 c = floor(p);
        vec2 f = p - c;
        float d1 = 8.0;
        float d2 = 8.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec4 h = rtHash4(c + g);
            vec2 o = g + 0.5 + 0.86 * (h.xy - 0.5) - f;
            float d = dot(o, o);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
        return sqrt(d2) - sqrt(d1);
      }

      void main() {
        #include <logdepthbuf_fragment>
        if (vFilm.x < -0.03) discard;
        vec2 w = rtWorldXZ(vPos);
        vec3 toEye = cameraPosition - vPos;
        float dist = length(toEye);
        vec3 V = toEye / max(dist, 1e-3);
        float sh = rtShadow(vPos, vec3(0.0, 1.0, 0.0));

        // ---- the salt: white, a little blue in its hollows, its ridges a net of polygons a metre or two across
        float px = max(fwidth(w.x), fwidth(w.y));
        float e1 = rtCrust(w / 1.05 + rtNoiseAt(w, 19.0).rg * 0.7);
        // (a ridge is a hand wide: gone before it is thinner than a pixel, or the net is a shimmer of dashes)
        float ridge = (1.0 - smoothstep(0.02, 0.07 + px * 1.2, e1)) * (1.0 - smoothstep(0.035, 0.16, px));
        vec4 slow = rtNoiseAt(w, 310.0);
        // (under a high sun white salt is the brightest thing in the land and must still have its tones: kept under white)
        vec3 salt = mix(vec3(0.50, 0.53, 0.58), vec3(0.62, 0.61, 0.58), slow.g) * (0.94 + 0.12 * rtNoiseAt(w + 9.0, 41.0).a);
        vec3 saltLit = salt * rtGroundLight(sh);

        // ---- where the crust stands dry: islands of it, by a slow noise, more of them the drier the pan
        // (their ragged edges only as far as the eye can tell them; from a kilometre or two out the pan is all mirror: at
        // that glance a dry crust and a wet one are the same sheet of light, and noise across it was bars on the horizon)
        float fine = (rtNoiseAt(w + 71.0, 90.0).b - 0.5) * 0.3 * (1.0 - smoothstep(0.4, 2.5, px));
        float island = smoothstep(0.69 - 0.16 * uDry, 0.74 - 0.16 * uDry, slow.r * 0.7 + 0.15 + fine) * (1.0 - smoothstep(600.0, 1700.0, dist));
        float wet = smoothstep(0.0, 0.035, vFilm.x) * (1.0 - island) * smoothstep(0.35, 0.8, vFilm.y);

        // ---- the mirror: the breath of the wind on it leans the picture a little, less and less far off
        vec2 drift = uWind.xy * (0.2 + 0.6 * uWind.z) * uTime;
        vec4 r1 = rtNoiseAt(w - drift, 7.0);
        vec4 r2 = rtNoiseAt(w * vec2(1.0, 1.6) + drift * 0.6 + 31.0, 23.0);
        float rough = (0.0016 + 0.012 * uWind.z + 0.02 * uWeather.x) * (0.25 + 0.75 * (1.0 - smoothstep(30.0, 320.0, dist)));
        vec2 tilt = ((r1.rg - 0.5) + (r2.gb - 0.5) * 1.4) * rough;
        vec3 sky = uMirrorOn > 0.5 ? rtMirrorAt(vPos, tilt) : mix(uFogColor, uSkyColor, 0.5);
        // (a hand of water over white salt: a mirror at any glance but straight down, where the salt shows through)
        float fres = mix(0.62, 1.0, pow(1.0 - max(V.y, 0.0), 2.6));
        vec3 under = saltLit * mix(vec3(0.82, 0.9, 0.96), vec3(1.0), 0.4) * (1.0 - 0.1 * ridge);
        vec3 wetCol = mix(under, sky, fres);
        // (the ridges just break the film, near the eye: thin bright threads on the mirror)
        wetCol = mix(wetCol, saltLit * 1.04, ridge * 0.2 * (1.0 - smoothstep(6.0, 40.0, dist)));

        // ---- dry: the polygons in the sun, their ridges lit on the sun's side
        vec3 dryCol = saltLit * (1.0 + 0.1 * ridge) * (1.0 - 0.14 * smoothstep(0.1, 0.3, e1) * (1.0 - smoothstep(0.3, 0.55, e1)) * (1.0 - smoothstep(0.06, 0.3, px)));
        // (the damp rim of an island, darker)
        float rim = smoothstep(0.0, 1.0, island) * (1.0 - island) * 4.0;
        dryCol *= 1.0 - 0.14 * rim;

        vec3 col = mix(dryCol, wetCol, wet);
        col += rtHeadlight(salt, vec3(0.0, 1.0, 0.0), vPos) * 0.7;
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
