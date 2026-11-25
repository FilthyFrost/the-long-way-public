// The mask she wears in place of a face for now (core/character/head.ts maskField): white porcelain in the game's
// two tones and ink, its face drawn on it — eyes closed in a smile, a blush with three little strokes on each cheek,
// a small cat's mouth. Drawn from where each point is on her head (aMask: x and y in the Head bone's frame).

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { HEAD } from '../../core/character/head';

/** the mask's outline number (between her hair's and her clothes', so lines are drawn round it) */
export const MASK_INK = 0.152;

const VERTEX = /* glsl */ `
${GLSL_VERTEX_PARS}
#include <skinning_pars_vertex>
attribute vec2 aMask;
varying vec2 vMask;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 objNormal = objectNormal;
  vMask = aMask;
  ${GLSL_VERTEX_MAIN}
}`;

const FRAGMENT = /* glsl */ `
${GLSL_FRAGMENT_PARS}
${GLSL_COMMON}
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uLine;
uniform vec3 uBlush;
uniform vec2 uEye;
uniform float uHide;
varying vec2 vMask;
float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-6) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}
// a stroke along y = f(x) for |x| < hw: how much of it covers this point
float stroke(vec2 p, float hw, float y, float thick) {
  return (1.0 - aaStep(thick, abs(p.y - y))) * (1.0 - aaStep(hw, abs(p.x)));
}
void main() {
  #include <logdepthbuf_fragment>
  if (uHide > 0.5) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vPos);
  if (dot(N, V) < 0.0) N = -N;
  float ndl = dot(N, uSunDir);
  float sh = rtShadowMap(vPos + uSunDir * 0.32, N) * rtCloudShade(vPos);
  float lit = smoothstep(-0.015, 0.045, ndl) * sh;
  vec3 sky = rtSkyLight(N, vPos) + rtRoomLamps(vPos, N);
  float grey = dot(sky, vec3(0.333));
  vec3 skyL = mix(sky, vec3(grey), 0.55) * 1.4 + 0.05;
  vec3 sunL = uSunColor * 0.36 + sky * 0.45;
  vec3 col = mix(uShade * skyL, uLit * sunL, lit);
  vec3 faceLight = mix(skyL * 1.5, sunL * 1.2, lit);
  vec2 f = vMask;
  float ink = 0.0;
  // the blush: a soft pink oval on each cheek and three short strokes across it
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? 1.0 : -1.0;
    vec2 b = vec2((f.x - side * (uEye.x + 0.009)) * side, f.y - (uEye.y - 0.021));
    float oval = length(b / vec2(0.0105, 0.0055));
    col = mix(col, uBlush * faceLight, (1.0 - smoothstep(0.55, 1.0, oval)) * 0.55);
    for (int k = 0; k < 3; k++) {
      float cx = (float(k) - 1.0) * 0.0042;
      vec2 q = b - vec2(cx, 0.0);
      // a short slanted stroke: along (0.45, 1), its half-length 0.0026
      vec2 d = normalize(vec2(0.45, 1.0));
      float along = dot(q, d), across = dot(q, vec2(d.y, -d.x));
      float m = (1.0 - aaStep(0.00042, abs(across))) * (1.0 - aaStep(0.0026, abs(along)));
      col = mix(col, uBlush * 0.62 * faceLight, m * 0.85);
    }
  }
  // the eyes: closed in a smile, an arch each
  for (int s = 0; s < 2; s++) {
    float side = s == 0 ? 1.0 : -1.0;
    vec2 p = vec2((f.x - side * uEye.x) * side, f.y - uEye.y);
    float w = 0.0085;
    float u = p.x / w;
    float y = 0.0042 * (1.0 - u * u) - 0.0012;
    ink = max(ink, stroke(p, w, y, 0.00062 + 0.00025 * (1.0 - u * u)));
    // a lash flicking out at the outer end
    vec2 l = p - vec2(w * 0.95, -0.0012);
    float lu = l.x / 0.0028;
    ink = max(ink, (1.0 - aaStep(0.0004, abs(l.y - 0.0016 * lu))) * (1.0 - aaStep(1.0, abs(lu - 0.5) * 2.0)));
  }
  // the mouth: a small cat's mouth, two little cups side by side
  {
    vec2 m = f - vec2(0.0, uEye.y - 0.039);
    float ax = abs(m.x);
    float u = (ax - 0.0032) / 0.0032;
    float y = -0.0021 * (1.0 - u * u);
    ink = max(ink, stroke(vec2(u, m.y), 1.0, y, 0.00048) * (1.0 - aaStep(0.0064, ax)));
  }
  col = mix(col, uLine * faceLight * 0.5, ink);
  gl_FragColor = vec4(col, ${MASK_INK.toFixed(3)});
}`;

export function maskMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uLit: { value: new THREE.Color().setRGB(0.88, 0.86, 0.84) },
      uShade: { value: new THREE.Color().setRGB(0.6, 0.6, 0.66) },
      uLine: { value: new THREE.Color().setRGB(0.12, 0.07, 0.07) },
      uBlush: { value: new THREE.Color().setRGB(0.96, 0.52, 0.52) },
      uEye: { value: new THREE.Vector2(HEAD.eye.x, HEAD.eye.y) },
      uHide: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  m.name = 'player:mask';
  return m;
}
