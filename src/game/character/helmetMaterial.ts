// Her helmet's paint (core/character/helmet.ts): in the game's two tones and ink. A glossy white shell with a racing
// stripe over the crown in the orange-red of her eyes, pinstripes either side; black rubber round its lower edge; a
// sharp highlight where the sun glints. The visor smoke-dark, the sky in its top, two bright streaks across it. The
// pivots grey metal with a dark screw. Each point knows what it is and where it is on the helmet (aHelmet).

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { HELMET } from '../../core/character/helmet';

/** outline numbers: the shell, the pivots, the visor (lines are drawn where they meet) */
export const HELMET_INK = { shell: 0.12, pivot: 0.128, visor: 0.136 };

const VERTEX = /* glsl */ `
${GLSL_VERTEX_PARS}
#include <skinning_pars_vertex>
attribute vec4 aHelmet;
varying vec4 vHelmet;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 objNormal = objectNormal;
  vHelmet = aHelmet;
  ${GLSL_VERTEX_MAIN}
}`;

const FRAGMENT = /* glsl */ `
${GLSL_FRAGMENT_PARS}
${GLSL_COMMON}
uniform float uInCab;
uniform float uHide;
uniform vec3 uShellLit;
uniform vec3 uShellShade;
uniform vec3 uStripe;
uniform vec3 uRubber;
uniform vec3 uVisor;
uniform vec3 uMetal;
/** the lower edge (back, front) and the stripe's half-width */
uniform vec3 uEdge;
varying vec4 vHelmet;
float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-6) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}
void main() {
  #include <logdepthbuf_fragment>
  if (uHide > 0.5) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vPos);
  bool back = dot(N, V) < 0.0;
  if (back) N = -N;
  float ndl = dot(N, uSunDir);
  float sh = rtShadowMap(vPos + uSunDir * 0.32, N) * rtCloudShade(vPos);
  float lit = smoothstep(-0.015, 0.045, ndl) * sh;
  vec3 sky = rtSkyLight(N, vPos) + rtRoomLamps(vPos, N);
  if (uInCab > 0.01) sky = mix(sky, uCabinAmb * (0.82 + 0.18 * N.y) + uCabinLamp * (0.62 + 0.38 * N.y), uInCab);
  float grey = dot(sky, vec3(0.333));
  vec3 skyL = mix(sky, vec3(grey), 0.5) * 1.35 + 0.04;
  vec3 sunL = uSunColor * 0.36 + sky * 0.45;
  float part = vHelmet.x;
  vec3 l = vHelmet.yzw;
  vec3 col;
  float ink = ${HELMET_INK.shell.toFixed(3)};
  // the glint of the sun on a glossy surface: one sharp spot (cel), and the sky along the top
  vec3 R = reflect(-V, N);
  float glint = smoothstep(0.955, 0.968, dot(R, uSunDir)) * sh;
  if (part < 0.5) {
    // the shell: white, the stripe over the crown and down the back, pinstripes beside it; rubber round the lower edge
    vec3 litP = uShellLit, shadeP = uShellShade;
    float overFront = step(0.06, l.z) * step(l.y, ${(HELMET.port.top + 0.012).toFixed(3)});
    float stripe = (1.0 - aaStep(uEdge.z, abs(l.x))) * (1.0 - overFront);
    float pin = (1.0 - aaStep(0.0011, abs(abs(l.x) - uEdge.z - 0.0045))) * (1.0 - overFront);
    litP = mix(litP, uStripe, stripe);
    shadeP = mix(shadeP, uStripe * 0.55, stripe);
    float t = clamp((l.z + 0.1) / 0.23, 0.0, 1.0);
    float yb = mix(uEdge.x, uEdge.y, t);
    float rubber = 1.0 - aaStep(yb + 0.0075, l.y);
    litP = mix(litP, uRubber, rubber);
    shadeP = mix(shadeP, uRubber * 0.7, rubber);
    // two vent slots on the front of the chin bar
    float vent = 0.0;
    if (l.z > 0.09) for (int k = 0; k < 2; k++) {
      float vy = 0.008 + float(k) * 0.0115;
      vec2 q = vec2(abs(l.x), l.y - vy);
      float slot = (1.0 - aaStep(0.0021, abs(q.y))) * (1.0 - aaStep(0.021 - float(k) * 0.003, q.x));
      vent = max(vent, slot);
    }
    litP = mix(litP, uRubber, vent);
    shadeP = mix(shadeP, uRubber, vent);
    col = mix(shadeP * skyL, litP * sunL, lit);
    col = mix(col, vec3(1.0) * (sunL + 0.4), glint * (1.0 - rubber) * (1.0 - vent) * 0.9);
    col = mix(col, pin > 0.5 ? uRubber * skyL : col, pin * 0.85);
    // a soft band of sky along the top of the dome (its gloss)
    col += uSkyColor * 0.08 * smoothstep(0.55, 0.95, N.y) * (1.0 - rubber);
  } else if (part < 1.5) {
    // the visor: smoke, the sky in its top half, two bright streaks across it
    ink = ${HELMET_INK.visor.toFixed(3)};
    float up = clamp(N.y * 0.8 + 0.35, 0.0, 1.0);
    col = mix(uVisor * (skyL * 0.6 + 0.04), mix(uVisor, uSkyColor, 0.55) * (0.65 + 0.35 * lit), up * up);
    float s = l.x * 0.42 + (l.y - 0.075);
    float streak = (1.0 - aaStep(0.006, abs(s - 0.024))) + 0.6 * (1.0 - aaStep(0.0026, abs(s - 0.04)));
    col = mix(col, vec3(0.96, 0.97, 1.0) * (0.55 + 0.45 * lit), clamp(streak, 0.0, 1.0) * 0.85);
    col = mix(col, vec3(1.0), glint);
  } else {
    // a pivot: grey metal, a dark screw in its middle
    ink = ${HELMET_INK.pivot.toFixed(3)};
    float r = length(vec2(l.y - ${HELMET.pivot.y.toFixed(3)}, l.z - ${HELMET.pivot.z.toFixed(3)}));
    vec3 p = mix(uMetal, uRubber, 1.0 - aaStep(0.0038, r));
    col = mix(p * 0.6 * skyL, p * sunL, lit);
    col = mix(col, vec3(1.0), glint * 0.8);
  }
  if (back) col = uRubber * skyL * 0.6;
  col += rtHeadlight(uShellLit, N, vPos);
  col = rtFog(col, vPos, cameraPosition);
  gl_FragColor = vec4(col, ink);
}`;

export function helmetMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uInCab: { value: 0 },
      uHide: { value: 0 },
      uShellLit: { value: new THREE.Color().setRGB(0.86, 0.85, 0.84) },
      uShellShade: { value: new THREE.Color().setRGB(0.6, 0.61, 0.68) },
      uStripe: { value: new THREE.Color().setRGB(0.92, 0.3, 0.1) },
      uRubber: { value: new THREE.Color().setRGB(0.07, 0.07, 0.08) },
      uVisor: { value: new THREE.Color().setRGB(0.06, 0.07, 0.1) },
      uMetal: { value: new THREE.Color().setRGB(0.55, 0.57, 0.6) },
      uEdge: { value: new THREE.Vector3(HELMET.bottom.back, HELMET.bottom.front, 0.0165) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  m.name = 'player:helmet';
  return m;
}
