// How her clothes are painted (docs/V3/plan/character-pv.md §4): cel like her skin, in white fabric whose shade is a
// cool grey-lavender, the deep of a fold deeper; the inside of the skirt in its own shade. The lace is drawn here, not
// modelled: along a trimmed edge (the mesh says how far along it and how far in from it each point is) the edge is
// cut into scallops, a row of eyelets is punched through, and little rings of stitching sit between them, as the
// turnaround's broderie. Ribbons a little whiter, the bandage a warm off-white with its turns' edges inked.

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { INK, SEE_GLSL, seeUniforms } from './material';

export interface ClothPaint {
  lit: THREE.Color;
  shade: THREE.Color;
  deep: THREE.Color;
  bandLit: THREE.Color;
  bandShade: THREE.Color;
}

export const NIGHTDRESS: ClothPaint = {
  lit: new THREE.Color().setRGB(0.74, 0.72, 0.7),
  shade: new THREE.Color().setRGB(0.42, 0.42, 0.52),
  deep: new THREE.Color().setRGB(0.27, 0.27, 0.36),
  bandLit: new THREE.Color().setRGB(0.7, 0.66, 0.6),
  bandShade: new THREE.Color().setRGB(0.4, 0.37, 0.42),
};

const vertex = (skinned: boolean) => /* glsl */ `
${GLSL_VERTEX_PARS}
${skinned ? '#include <skinning_pars_vertex>' : ''}
attribute vec4 aCloth;
${skinned ? '' : 'attribute float aFold;'}
varying vec4 vCloth;
varying float vFold;
varying vec3 vBindC;
void main() {
  #include <beginnormal_vertex>
  ${skinned ? '#include <skinbase_vertex>\n  #include <skinnormal_vertex>' : ''}
  #include <begin_vertex>
  ${skinned ? '#include <skinning_vertex>' : ''}
  vec3 objNormal = objectNormal;
  vCloth = aCloth;
  vBindC = position;
  vFold = ${skinned ? '0.0' : 'aFold'};
  ${GLSL_VERTEX_MAIN}
}`;

const FRAGMENT = /* glsl */ `
${GLSL_FRAGMENT_PARS}
${GLSL_COMMON}
uniform float uInCab;
vec3 rtHerSky(vec3 N, vec3 pos) {
  vec3 open = rtSkyLight(N, pos) + rtRoomLamps(pos, N);
  if (uInCab < 0.01) return open;
  float lum = dot(uSkyColor, vec3(0.333));
  vec3 cab = mix(uSkyColor, vec3(lum) * vec3(1.06, 1.0, 0.9), 0.55) * uCabinAmb * (0.82 + 0.18 * N.y) + uCabinLamp * (0.62 + 0.38 * N.y);
  return mix(open, cab, uInCab);
}
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uDeep;
uniform vec3 uBandLit;
uniform vec3 uBandShade;
uniform vec2 uInk;
uniform float uHide;
/** a garment's second colour (cuffs, band, sole, straps) */
uniform vec3 uTrim;
varying vec4 vCloth;
varying float vFold;
varying vec3 vBindC;
float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-5) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}
${SEE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  if (uHide > 0.5) discard;
  seeThroughBox();
  seeViewFade(vPos);
  float stuff = vCloth.z;
  float s = vCloth.x;
  float d = vCloth.y;
  bool lace = stuff > 0.5 && stuff < 1.5;
  float stitch = 0.0;
  if (lace) {
    // scallops along the edge, eyelets through the band, rings of stitching between them
    float period = 0.0155;
    float u = fract(s / period) * 2.0 - 1.0;
    float scallop = 0.0055 * (1.0 - sqrt(max(0.0, 1.0 - u * u)));
    if (d < scallop) discard;
    vec2 q = vec2((fract(s / period + 0.5) - 0.5) * period, d - 0.0125);
    if (length(q) < 0.0019) discard;
    vec2 q2 = vec2((fract(s / period) - 0.5) * period, d - 0.0225);
    float ring = abs(length(q2 * vec2(1.0, 1.2)) - 0.0034);
    stitch = 1.0 - aaStep(0.00045, ring);
    // a line of stitching where the lace meets the fabric
    stitch = max(stitch, 1.0 - aaStep(0.0004, abs(d - 0.031)));
    // little dots along the scallops
    stitch = max(stitch, 1.0 - aaStep(0.0008, length(vec2(u * period * 0.5, d - scallop - 0.0026))));
  }
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vPos);
  bool back = dot(N, V) < 0.0;
  if (back) N = -N;
  float ndl = dot(N, uSunDir);
  float sh = rtShadowMap(vPos + uSunDir * 0.32, N) * rtCloudShade(vPos);
  float lit = smoothstep(-0.02, 0.06, ndl) * sh;
  bool band = stuff > 2.5 && stuff < 9.5;
  bool garment = stuff > 9.5;
  vec3 litPaint = band ? uBandLit : uLit;
  vec3 shadePaint = band ? uBandShade : uShade;
  float seam = 0.0;
  if (garment) {
    // the garments' own marks, from where each point is on her (the bind pose: x across, y up, z forward)
    vec3 b = vBindC;
    float trim = 0.0;
    if (stuff < 10.5) {
      // a jacket: the zip down its front, the hem's band
      seam = (1.0 - aaStep(0.0009, abs(b.x))) * step(0.0, b.z);
      trim = 1.0 - aaStep(0.0, b.y - 0.86);
    } else if (stuff < 11.5) {
      // a sweater: knitted ribs, the ribbed hem
      seam = (1.0 - aaStep(0.18, abs(fract(b.x / 0.007) - 0.5) * 2.0 - 0.6)) * 0.35;
      trim = 1.0 - aaStep(0.0, b.y - 0.885);
    } else if (stuff < 13.5) {
      // padded and down: the stitched baffles between the puffs, the zip
      float t = (b.y - 0.78) / (stuff > 12.5 ? 0.075 : 0.11);
      seam = (1.0 - aaStep(0.06, abs(fract(t) - 0.5) * 2.0 - 0.88));
      seam = max(seam, (1.0 - aaStep(0.0011, abs(b.x))) * step(0.0, b.z));
    } else if (stuff < 15.5) {
      // trousers: the crease down the front of each leg, the waistband
      seam = (1.0 - aaStep(0.0007, abs(abs(b.x) - 0.08))) * step(0.03, b.z) * step(b.y, 0.84) * 0.6;
      trim = 1.0 - aaStep(0.0, 0.965 - b.y);
    } else if (stuff < 16.5) {
      // shoes: the sole, the laces' line
      trim = 1.0 - aaStep(0.0, b.y - 0.016);
      seam = (1.0 - aaStep(0.0008, abs(abs(b.x) - 0.088))) * step(0.03, b.z) * 0.4;
    } else if (stuff < 17.5) {
      trim = 0.0;
    } else if (stuff < 18.5) {
      // hats: the band (or the brim)
      trim = step(0.5, vCloth.w);
    } else {
      // packs: the straps
      trim = step(0.5, vCloth.w);
      seam = (1.0 - aaStep(0.001, abs(b.y - 1.2))) * step(b.z, -0.2) * 0.5;
    }
    litPaint = mix(litPaint, uTrim, trim);
    shadePaint = mix(shadePaint, uTrim * vec3(0.62, 0.6, 0.7), trim);
  }
  if (stuff > 1.5 && stuff < 2.5) litPaint *= 1.06;
  if (lace) litPaint *= 1.04;
  vec3 sky = rtHerSky(N, vPos);
  float grey = dot(sky, vec3(0.333));
  vec3 skyL = mix(sky, vec3(grey), 0.45) * 1.3 + 0.04;
  vec3 sunL = uSunColor * 0.36 + sky * 0.45;
  // the deep of a fold the cloth has really made, and the inside of the skirt
  float deep = smoothstep(0.0025, 0.006, vFold);
  vec3 col = mix(shadePaint * skyL, litPaint * sunL, lit * (1.0 - deep * 0.85));
  col = mix(col, uDeep * skyL, deep * (1.0 - lit) * 0.8);
  if (back) col = shadePaint * skyL * 0.8;
  col = mix(col, uDeep * skyL * 0.9, stitch * 0.75);
  col = mix(col, shadePaint * skyL * 0.75, seam * 0.8);
  // the bandage: its turns' edges a touch darker
  if (band) col *= mix(0.82, 1.0, aaStep(0.002, d));
  col += uSkyColor * 0.08 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += rtHeadlight(litPaint, N, vPos);
  col = rtFog(col, vPos, cameraPosition);
  // ink: fabric, the lace band, ribbons and the bandage's turns each their own number
  float ink = uInk.x;
  if (lace) ink += uInk.y * 0.5;
  else if (stuff > 1.5 && stuff < 2.5) ink = ${INK.TRIM.toFixed(3)} - vCloth.w * 0.006;
  else if (garment) ink = ${(INK.CLOTH + 0.012).toFixed(3)} + step(0.5, vCloth.w) * 0.016;
  else if (band) ink = ${(INK.CLOTH + 0.004).toFixed(3)} + mod(vCloth.w, 2.0) * 0.02;
  gl_FragColor = vec4(col, ink);
}`;

export function clothMaterial(skinned: boolean, paint: ClothPaint = NIGHTDRESS): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...globals,
      // (each material its own colours: a garment's paint must not repaint the nightdress)
      uLit: { value: paint.lit.clone() },
      uShade: { value: paint.shade.clone() },
      uDeep: { value: paint.deep.clone() },
      uBandLit: { value: paint.bandLit.clone() },
      uBandShade: { value: paint.bandShade.clone() },
      uInk: { value: new THREE.Vector2(INK.CLOTH, INK.CLOTH_SPAN) },
      uInCab: { value: 0 },
      uHide: { value: 0 },
      ...seeUniforms(),
      uTrim: { value: new THREE.Color(0.3, 0.3, 0.32) },
    },
    vertexShader: vertex(skinned),
    fragmentShader: FRAGMENT,
  });
  m.name = skinned ? 'player:cloth' : 'player:skirt';
  return m;
}
