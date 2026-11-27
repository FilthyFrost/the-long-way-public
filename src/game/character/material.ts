// How she is painted (docs/V3/plan/character-pv.md §4): cel, as a film draws its people over painted backgrounds
// (Painted Valley's wanderer; specs/art/STYLE.md §1 "people and cars: cel + ink").
//
// Each surface has a lit paint and a shade paint chosen as paint, not one colour darkened: her skin's shade is a
// deeper, redder brown; the lit side turns to it along one clean line. The shade is lit by the sky's own colour (and
// a room's openings and lamps, the garage's), the lit side by the sun as well. Palms and soles are paler; knuckles,
// knees and fingertips carry a touch of red. Each part writes an ink number into the frame's alpha, and the frame's
// last pass draws the line wherever two numbers meet (render/frame.ts): her numbers run smoothly along her skin and
// jump where one part lies over another, so a finger over the palm or an arm across her is inked as well.

import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';

/**
 * Seen through in a box on the screen (docs/V3/plan/finish.md §五): her hands on the wheel, where they stand before
 * the instruments she is looking at — thinned to a quarter of their points within the box (an ordered pattern, the
 * surface left opaque), whole again a little way outside it. uSeeBox: the box's middle and half size (frame px);
 * uSeeK: how far (0 … 1) and the frame's height (px). Her skin and her clothes both (HerInGame.seeThrough sets them).
 *
 * And seen through near the eye over the middle of the view (seeViewFade; the player's ask of 2026-11-26: what of her
 * body stands in the view goes see-through): first person on foot, her trunk, legs and clothes — not her arms, not
 * her hands — thinned to a tenth of their points where they are within about half a metre of the eye and a fifth of
 * the screen's height of its middle (an ellipse half as wide again, Nomad Drive's for a thing held), whole again by a
 * metre off or 0.62 of the screen's height out; nothing at all of her within 12 cm of the eye (the view inside her as
 * she leans into a run). uSeeView: how far (0 … 1) and the frame's width and height (px).
 */
export const SEE_GLSL = `
uniform vec4 uSeeBox;
uniform vec2 uSeeK;
uniform vec3 uSeeView;
float seeBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
void seeThroughBox() {
  if (uSeeK.x <= 0.0) return;
  vec2 d = abs(gl_FragCoord.xy - uSeeBox.xy) - uSeeBox.zw;
  float gone = uSeeK.x * 0.75 * (1.0 - smoothstep(0.0, 0.04, max(d.x, d.y) / max(1.0, uSeeK.y)));
  float t = seeBayer2(0.5 * gl_FragCoord.xy) * 0.25 + seeBayer2(gl_FragCoord.xy);
  if (gone > t + 0.03) discard;
}
void seeViewFade(vec3 p) {
  if (uSeeView.x <= 0.0) return;
  vec2 c = (gl_FragCoord.xy - 0.5 * uSeeView.yz) / max(1.0, uSeeView.z);
  c.x /= 1.4;
  float r = length(c);
  float near = length(p - cameraPosition);
  float gone = uSeeView.x * 0.9 * (1.0 - smoothstep(0.2, 0.62, r)) * (1.0 - smoothstep(0.55, 1.05, near));
  gone = max(gone, uSeeView.x * (1.0 - smoothstep(0.12, 0.2, near)));
  float t = seeBayer2(0.5 * gl_FragCoord.xy) * 0.25 + seeBayer2(gl_FragCoord.xy);
  if (gone > t + 0.03) discard;
}
`;
/** the uniforms of SEE_GLSL, for a material's own set */
export function seeUniforms(): { uSeeBox: { value: THREE.Vector4 }; uSeeK: { value: THREE.Vector2 }; uSeeView: { value: THREE.Vector3 } } {
  return { uSeeBox: { value: new THREE.Vector4(0, 0, 1, 1) }, uSeeK: { value: new THREE.Vector2(0, 1) }, uSeeView: { value: new THREE.Vector3(0, 1, 1) } };
}

/** The ink numbers she writes (render/frame.ts draws lines between different ones below 0.23). */
export const INK = {
  /** skin: from SKIN at the trunk up to SKIN + SKIN_SPAN at the fingertips, by the mesh's own ink number */
  SKIN: 0.045,
  SKIN_SPAN: 0.06,
  HAIR: 0.118,
  HAIR_SPAN: 0.03,
  CLOTH: 0.158,
  CLOTH_SPAN: 0.03,
  TRIM: 0.19,
};

export interface SkinPaint {
  lit: THREE.Color;
  shade: THREE.Color;
  deep: THREE.Color;
  palmLit: THREE.Color;
  palmShade: THREE.Color;
  blush: THREE.Color;
}

/** Her skin, linear: a warm deep brown in the light, a redder brown in the shade (the turnaround's flat tone between). */
export const HER_SKIN: SkinPaint = {
  lit: new THREE.Color().setRGB(0.235, 0.128, 0.094),
  shade: new THREE.Color().setRGB(0.19, 0.094, 0.08),
  deep: new THREE.Color().setRGB(0.125, 0.058, 0.055),
  palmLit: new THREE.Color().setRGB(0.42, 0.25, 0.19),
  palmShade: new THREE.Color().setRGB(0.26, 0.14, 0.12),
  blush: new THREE.Color().setRGB(0.33, 0.12, 0.09),
};

const VERTEX = /* glsl */ `
${GLSL_VERTEX_PARS}
#include <skinning_pars_vertex>
attribute vec4 aSkin;
attribute vec4 aFinger;
attribute float aRegion;
varying vec4 vSkin;
varying vec4 vFinger;
varying float vRegion;
varying vec3 vBind;
void main() {
  vRegion = aRegion;
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec3 objNormal = objectNormal;
  // (packed: the part as a third, the finger's numbers in thousandths)
  vSkin = vec4(aSkin.xy, aSkin.z * 3.0, aSkin.w);
  vFinger = aFinger * 0.001;
  vBind = position;
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
uniform vec3 uPalmLit;
uniform vec3 uPalmShade;
uniform vec3 uBlush;
uniform vec2 uInk;
/** parts not drawn (first person): x the head, y the left arm, z the right arm, w the rest */
uniform vec4 uHide;
uniform float uSelfShadow;
/** the head bone in the bind pose (her face is drawn in its frame) */
uniform vec3 uHead;
/** draw her face's eyes and mouth (0 while the mask is worn) */
uniform float uDrawFace;
/** x the eyes' openness (1 open, 0 shut), yz where they look (m on the face), w the mouth open */
uniform vec4 uFace;
uniform vec3 uIris;
uniform vec3 uIrisDeep;
uniform vec3 uLash;
varying vec4 vSkin;
varying vec4 vFinger;
varying float vRegion;
varying vec3 vBind;
/** her body's regions under clothes (wardrobe.ts REGIONS): 1 hidden */
uniform float uCover[9];
uniform vec3 uNail;
uniform vec3 uNailTip;
/** 1: drawn as grey clay lit from over the viewer's shoulder (for judging her forms: ?clay=1 on the preview) */
uniform float uClay;

// --- her face, drawn on the skin of the head in its own frame (metres, x to her left, y up)
float aaStep(float edge, float x) {
  float w = max(fwidth(x), 1e-5) * 0.75;
  return smoothstep(edge - w, edge + w, x);
}

// --- her nails and the creases of her finger joints, in each finger's own frame (core/character/mesh.ts fingerCoords)
// returns how the nail tints her skin (rgb: a multiplier of the skin as lit, a: how much) and, out, a line
vec4 rtNail(vec4 f, out float line) {
  line = 0.0;
  float code = f.w;
  if (code < 0.5) return vec4(0.0);
  float bone = floor(code / 10.0);
  float u = f.x, v = f.y, back = f.z;
  bool toe = code > 59.5;
  bool tip = bone == 3.0 || (toe && code < 69.5);
  vec4 o = vec4(0.0);
  if (tip && back > 0.0) {
    // the plate: her own skin a little lighter and pinker (a nail on dark skin), from the cuticle's arc a little
    // before the middle of the last bone to a paler free edge at the tip, a little narrower than the finger and
    // fading round its sides; a soft line at the cuticle only, a small sheen
    float v0 = toe ? 0.34 : 0.47, v1 = toe ? 0.9 : 0.975;
    float hw = toe ? 0.62 : 0.6;
    float uu = clamp(u / hw, -1.0, 1.0);
    float root = v0 + 0.06 * (1.0 - uu * uu);
    float inside = aaStep(-hw, u) * (1.0 - aaStep(hw, u)) * aaStep(root, v) * (1.0 - aaStep(v1, v));
    inside *= smoothstep(0.12, 0.45, back);
    vec3 c = uNail;
    // the free edge, whiter; the half-moon at the root, paler
    c = mix(c, uNailTip, aaStep(v1 - 0.075 + 0.02 * uu * uu, v));
    float moon = 1.0 - aaStep(0.1, length(vec2(uu * 0.5, (v - root) * 1.3)));
    c = mix(c, uNailTip * 0.92, moon * 0.4);
    // a small sheen to one side
    float sheen = (1.0 - aaStep(0.11, length(vec2((uu + 0.35) * 0.9, (v - mix(root, v1, 0.45)) * 1.6))));
    c = mix(c, vec3(1.55, 1.5, 1.45), sheen * 0.3);
    o = vec4(c, inside * 0.85);
    // the cuticle: a soft line along the root's arc
    float cut = (1.0 - aaStep(0.016, abs(v - root))) * (1.0 - aaStep(hw * 0.95, abs(u))) * smoothstep(0.2, 0.5, back);
    line = max(line, cut * 0.32);
  }
  if (!toe && (bone == 1.0 || bone == 2.0)) {
    // the knuckle's creases on the back near the bone's far end, one firm line under it on the pad side
    float a = 1.0 - aaStep(0.006, abs(v - (0.9 - 0.05 * u * u)));
    float b = 1.0 - aaStep(0.005, abs(v - (0.955 - 0.04 * u * u)));
    float onBack = smoothstep(0.2, 0.6, back) * (1.0 - aaStep(0.55, abs(u)));
    line = max(line, max(a, b * 0.8) * onBack * 0.3);
    float pad = 1.0 - aaStep(0.008, abs(v - 0.985));
    line = max(line, pad * smoothstep(-0.3, -0.7, back) * (1.0 - aaStep(0.7, abs(u))) * 0.6);
  }
  return o;
}

// one eye: p in the eye's frame (x outward from the nose, y up), returns the colour over the skin and its cover
vec4 rtEye(vec2 p, float open, vec2 look) {
  float a = 0.0148;
  float u = clamp(p.x / a, -1.0, 1.0);
  float tilt = 0.17 * p.x;
  float up = 0.0108 * open * pow(max(1.0 - u * u, 0.0), 0.62) + tilt + 0.0006;
  float lo = -0.0071 * pow(max(1.0 - u * u, 0.0), 0.95) + tilt * 0.6;
  float inside = aaStep(-a, p.x) * (1.0 - aaStep(a * 0.98, p.x)) * aaStep(lo, p.y) * (1.0 - aaStep(up, p.y));
  vec3 c = vec3(0.86, 0.8, 0.78);
  // the iris: large, red-orange, deep at the top under the lid's shadow, a darker ring and a slit of a pupil
  vec2 ic = vec2(-0.0006, -0.0005) + look;
  float r = length((p - ic) * vec2(1.0, 0.92));
  float iris = 1.0 - aaStep(0.0084, r);
  float ty = clamp((p.y - ic.y) / 0.0084, -1.0, 1.0);
  vec3 ir = mix(uIris, uIrisDeep, smoothstep(-0.3, 0.75, ty));
  ir = mix(ir, uIrisDeep * 0.6, aaStep(0.0069, r));
  c = mix(c, ir, iris);
  float pupil = 1.0 - aaStep(1.0, length((p - ic - vec2(0.0, 0.0004)) / vec2(0.0019, 0.0042)));
  c = mix(c, vec3(0.1, 0.012, 0.012), pupil);
  // the shadow the upper lid throws on the eye
  c *= mix(0.55, 1.0, aaStep(0.0028, up - p.y));
  // two catch-lights
  float hl = 1.0 - aaStep(0.0021, length(p - ic - vec2(-0.0028, 0.0026)));
  hl = max(hl, (1.0 - aaStep(0.0011, length(p - ic - vec2(0.003, -0.0032)))) * 0.85);
  c = mix(c, vec3(1.2), hl);
  // the upper lash line, thick to the outer corner and flicked out past it
  float lashT = mix(0.0015, 0.0031, smoothstep(-0.5, 1.0, u));
  float lash = aaStep(up - 0.0004, p.y) * (1.0 - aaStep(up + lashT, p.y)) * aaStep(-a * 1.02, p.x) * (1.0 - aaStep(a * 1.0, p.x));
  vec2 wq = p - vec2(a * 0.92, up + tilt * 0.0);
  float wing = (1.0 - aaStep(0.0, wq.x - 0.0058)) * aaStep(0.0, wq.x) * aaStep(-0.0002 + wq.x * 0.55, wq.y) * (1.0 - aaStep(0.0016 + wq.x * 0.6 - wq.x * wq.x * 40.0, wq.y));
  lash = max(lash, wing);
  // the lower lash: a thin line on the outer hw
  float lower = (1.0 - aaStep(0.00055, abs(p.y - lo + 0.0003))) * aaStep(-0.2, u) * (1.0 - aaStep(0.97, u)) * 0.8;
  // the crease of the lid above
  float crease = (1.0 - aaStep(0.00045, abs(p.y - (up + 0.0034 + 0.0006 * u)))) * aaStep(-0.6, u) * (1.0 - aaStep(0.85, u)) * 0.55;
  float line = max(max(lash, lower), crease);
  vec4 o = vec4(c, inside);
  o.rgb = mix(o.rgb, uLash, line);
  o.a = max(o.a, line);
  return o;
}

${SEE_GLSL}
void main() {
  #include <logdepthbuf_fragment>
  seeThroughBox();
  float part = vSkin.z;
  if (part < 0.5) seeViewFade(vPos);
  if (uHide.x > 0.5 && part > 0.5 && part < 1.5) discard;
  if (uHide.y > 0.5 && part > 1.5 && part < 2.5) discard;
  if (uHide.z > 0.5 && part > 2.5) discard;
  if (uHide.w > 0.5 && part < 0.5) discard;
  int region = int(vRegion + 0.5);
  for (int i = 0; i < 9; i++) if (i == region && uCover[i] > 0.5) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vPos);
  if (dot(N, V) < -0.2) N = -N;
  // (2: flat magenta, her silhouette to be measured against the turnaround's)
  if (uClay > 1.5) { gl_FragColor = vec4(1.0, 0.0, 1.0, uInk.x + uInk.y * vSkin.w); return; }
  if (uClay > 0.5) {
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), V) + vec3(1e-4, 0.0, 0.0));
    vec3 L = normalize(V * 0.75 + vec3(0.0, 0.8, 0.0) + right * 0.4);
    float d = max(dot(N, L), 0.0);
    float hemi = 0.5 + 0.5 * N.y;
    float rimc = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    vec3 c = vec3(0.7, 0.62, 0.56) * (0.16 + 0.22 * hemi + 0.7 * d) + vec3(0.1) * rimc;
    gl_FragColor = vec4(c, uInk.x + uInk.y * vSkin.w);
    return;
  }
  float ndl = dot(N, uSunDir);
  // not her own shadow (a figure in a film is two tones, not dappled by her own hair and fingers): the map is read
  // a little way toward the sun from her, past anything of her own; a tree, a roof or a car still shade her
  float sh = mix(1.0, rtShadowMap(vPos + uSunDir * 0.32, N), uSelfShadow) * rtCloudShade(vPos);
  // in the light or out of it, along one clean line
  float lit = smoothstep(-0.015, 0.045, ndl) * sh;
  float palm = vSkin.x;
  vec3 litPaint = mix(uLit, uPalmLit, palm);
  vec3 shadePaint = mix(uShade, uPalmShade, palm);
  litPaint = mix(litPaint, uBlush, vSkin.y * 0.35);
  shadePaint = mix(shadePaint, uBlush * 0.62, vSkin.y * 0.3);
  vec3 sky = rtHerSky(N, vPos);
  // the shade's light keeps little of the sky's colour: a shade colour is mixed as it should look (Painted Valley)
  float grey = dot(sky, vec3(0.333));
  vec3 skyL = mix(sky, vec3(grey), 0.55) * 1.4 + 0.05;
  vec3 sunL = uSunColor * 0.36 + sky * 0.45;
  vec3 col = mix(shadePaint * skyL, litPaint * sunL, lit);
  // the deep of a crease: where the skin faces well away from the sky and the sun both (under the chin, the armpit)
  float deep = smoothstep(-0.35, -0.75, N.y) * (1.0 - lit);
  col = mix(col, uDeep * skyL, deep * 0.6);
  // a thin rim of sky on the edge turned from the eye
  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += (uSkyColor * 0.12) * rim * (0.4 + 0.6 * lit);
  // her face (the head's skin only, its front; not while a mask is worn over it)
  if (uDrawFace > 0.5 && part > 0.5 && part < 1.5) {
    vec3 h = vBind - uHead;
    if (h.z > 0.03) {
      vec2 f = h.xy;
      float shadeK = mix(0.62, 1.0, lit);
      vec3 faceLight = mix(skyL * 1.6, sunL * 1.25, lit) * shadeK;
      for (int s = 0; s < 2; s++) {
        float side = s == 0 ? 1.0 : -1.0;
        vec2 p = vec2((f.x - side * 0.0305) * side, f.y - 0.0845);
        if (abs(p.x) < 0.026 && abs(p.y) < 0.018) {
          vec4 e = rtEye(p, uFace.x, vec2(uFace.y * side, uFace.z));
          col = mix(col, e.rgb * faceLight * 0.42, e.a);
        }
      }
      // the mouth: a small line, a little smile at her left corner
      vec2 m = f - vec2(0.0008, 0.0168);
      float mw = 0.0058;
      if (abs(m.x) < mw * 1.4 && abs(m.y) < 0.008) {
        float u = m.x / mw;
        float curve = 0.0011 * u * u - 0.0004 + 0.0009 * max(u, 0.0) * u;
        float open = uFace.w * 0.0042 * max(0.0, 1.0 - u * u);
        float line = (1.0 - aaStep(0.00042 + open, abs(m.y - curve + open * 0.5))) * (1.0 - aaStep(1.0, abs(u)));
        vec3 inner = mix(uLash, vec3(0.32, 0.06, 0.06), aaStep(0.0005, open));
        col = mix(col, inner * faceLight * 0.5, line * 0.9);
      }
    }
  }
  // nails and creases on her fingers and toes
  float crease;
  vec4 nail = rtNail(vFinger, crease);
  if (nail.a > 0.0 || crease > 0.0) {
    col = mix(col, col * nail.rgb, nail.a);
    col = mix(col, uDeep * skyL * 0.9, crease);
  }
  col += rtHeadlight(litPaint, N, vPos);
  col = rtFog(col, vPos, cameraPosition);
  gl_FragColor = vec4(col, uInk.x + uInk.y * vSkin.w);
}`;

export function skinMaterial(paint: SkinPaint = HER_SKIN): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uLit: { value: paint.lit.clone() },
      uShade: { value: paint.shade.clone() },
      uDeep: { value: paint.deep.clone() },
      uPalmLit: { value: paint.palmLit.clone() },
      uPalmShade: { value: paint.palmShade.clone() },
      uBlush: { value: paint.blush.clone() },
      uInk: { value: new THREE.Vector2(INK.SKIN, INK.SKIN_SPAN) },
      uInCab: { value: 0 },
      uHide: { value: new THREE.Vector4(0, 0, 0, 0) },
      ...seeUniforms(),
      uSelfShadow: { value: 1.0 },
      uCover: { value: new Array(9).fill(0) },
      uHead: { value: new THREE.Vector3(0, 1.415, 0.013) },
      uFace: { value: new THREE.Vector4(0.62, 0, 0, 0) },
      uDrawFace: { value: 0 },
      uIris: { value: new THREE.Color().setRGB(1.0, 0.36, 0.07) },
      uIrisDeep: { value: new THREE.Color().setRGB(0.42, 0.05, 0.03) },
      uLash: { value: new THREE.Color().setRGB(0.06, 0.025, 0.03) },
      uNail: { value: new THREE.Color().setRGB(1.24, 1.08, 1.06) },
      uNailTip: { value: new THREE.Color().setRGB(1.6, 1.45, 1.36) },
      uClay: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
  m.name = 'player:skin';
  return m;
}

/** The depth-only twin's material for the shadow maps (render/shadow.ts draws them with one plain material). */
export function shadowDepthMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    colorWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(transformed, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      void main() { gl_FragColor = vec4(1.0); }`,
  });
  // the cascades draw with an override material: this one must not be overridden (three's allowOverride)
  (m as unknown as { allowOverride: boolean }).allowOverride = false;
  m.name = 'player:shadow';
  return m;
}

// ------------------------------------------------------------------------------------------------------ hair

export interface HairPaint {
  lit: THREE.Color;
  shade: THREE.Color;
  deep: THREE.Color;
  shine: THREE.Color;
}

/** White hair: lit a warm off-white (so the shine reads), shade a cool lavender grey, never a dead grey. */
export const HER_HAIR: HairPaint = {
  lit: new THREE.Color().setRGB(0.8, 0.785, 0.775),
  shade: new THREE.Color().setRGB(0.6, 0.585, 0.64),
  deep: new THREE.Color().setRGB(0.43, 0.41, 0.47),
  shine: new THREE.Color().setRGB(1.05, 1.04, 1.06),
};

const HAIR_VERTEX = /* glsl */ `
${GLSL_VERTEX_PARS}
#include <skinning_pars_vertex>
attribute vec4 aHair;
/** where the tips are swung to by her moving (head frame, m) and the wind there (xyz, w its gustiness) */
uniform vec3 uSwing;
uniform vec4 uHairWind;
uniform float uTime;
varying vec4 vHair;
varying vec3 vBind;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  float t = aHair.x;
  float k = t * t * (aHair.z > 3.5 ? 1.8 : 1.0);
  float flutter = sin(uTime * (6.0 + aHair.y * 5.0) + aHair.y * 37.0 + t * 2.5);
  vec3 sway = uSwing * (0.75 + 0.5 * aHair.y) + uHairWind.xyz * (0.55 + 0.45 * flutter * uHairWind.w);
  transformed += sway * k;
  vBind = position;
  vHair = aHair;
  #include <skinning_vertex>
  vec3 objNormal = objectNormal;
  ${GLSL_VERTEX_MAIN}
}`;

const HAIR_FRAGMENT = /* glsl */ `
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
uniform vec3 uShine;
uniform vec2 uInk;
uniform vec3 uHead;
uniform float uHide;
/** a hat: the hair within this angle of the crown is under it */
uniform float uHatCut;
/** how many clumps round the mass (its edge's teeth; 0 none) */
uniform float uClumps;
varying vec4 vHair;
varying vec3 vBind;
void main() {
  #include <logdepthbuf_fragment>
  if (uHide > 0.5) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vPos);
  bool back = dot(N, V) < 0.0;
  if (back) N = -N;
  float ndl = dot(N, uSunDir);
  float sh = rtShadowMap(vPos + uSunDir * 0.32, N) * rtCloudShade(vPos);
  float lit = smoothstep(-0.02, 0.06, ndl) * sh;
  vec3 sky = rtHerSky(N, vPos);
  float grey = dot(sky, vec3(0.333));
  vec3 skyL = mix(sky, vec3(grey), 0.5) * 1.25 + 0.03;
  vec3 sunL = uSunColor * 0.36 + sky * 0.45;
  float layer = vHair.z;
  float t = vHair.x;
  vec3 litPaint = uLit;
  vec3 shadePaint = uShade;
  // the under layer and the cap sit in the hair's own shade; the nape's ends a little greyer
  float under = layer < 1.5 ? 1.0 : 0.0;
  vec3 h = vBind - uHead;
  float nape = smoothstep(0.06, -0.02, h.y) * smoothstep(0.0, -0.05, h.z);
  litPaint = mix(litPaint, uShade * 1.1, under * 0.6 + nape * 0.35);
  shadePaint = mix(shadePaint, uDeep, under * 0.7 + nape * 0.4);
  // white at the top, a little greyer toward the ends (as drawn)
  float low = smoothstep(0.15, 0.0, h.y);
  litPaint *= 1.0 - 0.13 * low;
  shadePaint *= 1.0 - 0.1 * low;
  vec3 col = mix(shadePaint * skyL, litPaint * sunL, lit * (1.0 - under * 0.5));
  if (back) col = uDeep * skyL;
  // the shine: a ring round the crown where the hair faces the eye, its edges ragged lock by lock
  vec3 d = normalize(h - vec3(0.0, 0.12, -0.02));
  float polar = acos(clamp(d.y, -1.0, 1.0));
  // (a hat comes lower at the back than at the front)
  if (uHatCut > 0.0 && polar < uHatCut + 0.35 * (0.5 - 0.5 * d.z / max(length(d.xz), 1e-4))) discard;
  float rag = 0.04 * sin(atan(d.x, d.z) * 9.0 + vHair.y * 23.0) + 0.02 * sin(vHair.y * 61.0);
  float ring = smoothstep(0.62 + rag, 0.68 + rag, polar) * (1.0 - smoothstep(0.82 + rag, 0.88 + rag, polar));
  ring *= smoothstep(0.25, 0.55, dot(N, V)) * (layer > 1.5 ? 1.0 : 0.0) * (0.35 + 0.65 * lit);
  col = mix(col, uShine * (sunL * 0.75 + 0.42), ring);
  // the mass's clumps: a line up from each notch of its ragged edge toward the crown, turning a little round it;
  // finer strands between, lower down (the round (vHair.w) as the edge's teeth count it)
  if (vHair.y > 0.9 && uClumps > 0.5) {
    // (round the head from the bind position, per pixel: no seam where the round turns over at her back)
    float round = atan(h.x, h.z + 0.02) / 6.2831853;
    float u = round * uClumps + 0.37 + h.y * 2.2;
    float f = fract(u);
    float e = min(f, 1.0 - f);
    float w = fwidth(u) * 1.1;
    float fade = smoothstep(0.255, 0.18, h.y);
    float far = 1.0 - smoothstep(0.035, 0.09, fwidth(u));
    float main = (1.0 - smoothstep(0.012, 0.012 + w, e)) * fade * far;
    float fine = (1.0 - smoothstep(0.008, 0.008 + w, abs(f - 0.5))) * smoothstep(0.2, 0.12, h.y) * (0.5 + 0.5 * sin(floor(u) * 7.1));
    col = mix(col, shadePaint * skyL * 0.72, max(main * 0.8, fine * 0.45 * far));
  }
  col += uSkyColor * 0.1 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  col += rtHeadlight(litPaint, N, vPos);
  col = rtFog(col, vPos, cameraPosition);
  // ink: a few numbers among the locks, so where one lies over another there is a line; the cap one of them
  float group = floor(vHair.y * 3.0);
  gl_FragColor = vec4(col, uInk.x + uInk.y * group * 0.5);
}`;

export function hairMaterial(paint: HairPaint = HER_HAIR): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...globals,
      uLit: { value: paint.lit },
      uShade: { value: paint.shade },
      uDeep: { value: paint.deep },
      uShine: { value: paint.shine },
      uInk: { value: new THREE.Vector2(INK.HAIR, INK.HAIR_SPAN) },
      uClumps: { value: 0 },
      uHead: { value: new THREE.Vector3(0, 1.415, 0.013) },
      uSwing: { value: new THREE.Vector3() },
      uHairWind: { value: new THREE.Vector4() },
      uHatCut: { value: 0 },
      uInCab: { value: 0 },
      uHide: { value: 0 },
    },
    vertexShader: HAIR_VERTEX,
    fragmentShader: HAIR_FRAGMENT,
  });
  m.name = 'player:hair';
  return m;
}
