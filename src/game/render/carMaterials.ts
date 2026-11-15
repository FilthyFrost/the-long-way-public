/**
 * ModCar materials (docs/MODCAR.md §6, specs/art/CAR_LOOK.md): the anime-industrial car look inside our
 * cel / painterly world (STYLE.md: cars are "cel + ink" against the painted background).
 *
 * The GLB models carry no shading of their own: every material is recognised by its NAME and swapped
 * for one of ours (`applyCarMaterials`). One `CarLook` holds the materials of one car, shared by all of
 * its meshes: a car costs one draw call per mesh and material, never one material per part.
 *
 * Per-instance colour and wear come from uniforms (a part drawn on its own: a door, a part in the hand)
 * AND from vertex attributes (a merged mesh of many parts): `aPaint` (vec3, linear colour), `aWear`
 * (vec3: dirt, rust, faded paint, added to the car's own) and `aPartId` (float, 1…: which part a vertex
 * belongs to, for the highlight of one part inside a merged mesh). See carMerge.ts.
 *
 * Shading families (one program each, the rest is uniforms):
 *   PAINT  paint, paint_b, ceramic  cel diffuse (lit tone, a separately tuned saturated shade tone, one clean
 *                                   terminator) + the world mirrored as hard bands + a crisp sun spot + rim
 *   METAL  chrome, steel, alu       the same bands, high contrast for chrome, soft over grey cel for the others
 *   MATTE  trim, rubber, rust, fabric, leather, wood, plastic_int (interior ones lit as a closed cabin)
 *   GLASS  glass, glass_dark        dark see-through tint, the bands, diagonal streaks; keeps the ink mask
 *   LENS   lens_head/_tail/_amber   clear coloured glass over the reflector when off, a glowing face when on
 *   GAUGE  gauge                    a dial painted from the UVs, lit at night
 *   EMIT   emit                     self-lit
 * Everything goes through the shared light of the world: rtShadow (cast shadows), rtHeadlight (beams),
 * rtFog, the cabin lamp; and opaque parts write the alpha ids the frame pass inks (frame.ts).
 */
import * as THREE from 'three';
import { skyUniforms } from '../env/sky';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from './shaderlib';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from './shadow';

/** the conventional material names (tools/blender/lib/modcar.py MAT_NAMES) */
export const CAR_MATERIAL_NAMES = [
  'paint',
  'paint_b',
  'trim',
  'chrome',
  'steel',
  'alu',
  'rubber',
  'glass',
  'glass_dark',
  'lens_head',
  'lens_tail',
  'lens_amber',
  'fabric',
  'leather',
  'wood',
  'plastic_int',
  'gauge',
  'ceramic',
  'rust',
  'emit',
] as const;

export type CarMaterialName = (typeof CAR_MATERIAL_NAMES)[number];

const NAMES = new Set<string>(CAR_MATERIAL_NAMES);

/** 'paint.001' (Blender's duplicate) → 'paint'; anything that is not a conventional name → null */
export function carMaterialName(name: string): CarMaterialName | null {
  const n = name.trim().toLowerCase().replace(/\.\d+$/, '');
  return NAMES.has(n) ? (n as CarMaterialName) : null;
}

type Family = 'paint' | 'metal' | 'matte' | 'glass' | 'lens' | 'gauge' | 'emit';

/**
 * How each name is shaded. Colours are linear. look = (gloss, sun spot size as cos, rim, sheen);
 * pattern: 0 none, 1 cloth weave, 2 leather grain, 3 wood grain, 4 rubber, 5 rusty metal, 6 plastic pebble.
 * wear: how much dirt, rust and fading may show on it (0…1 each). ink: a seed that keeps the ids of
 * neighbouring materials apart.
 */
interface Recipe {
  family: Family;
  base: [number, number, number];
  look: [number, number, number, number];
  pattern?: number;
  cabin?: boolean;
  wear?: [number, number, number];
  ink: number;
  /** glass: tint; lens: the lamp's light */
  tint?: [number, number, number];
  opacity?: number;
}

const RECIPES: Record<CarMaterialName, Recipe> = {
  paint: { family: 'paint', base: [0.5, 0.06, 0.035], look: [1.0, 0.9984, 0.55, 0], wear: [1, 1, 1], ink: 0.0 },
  paint_b: { family: 'paint', base: [0.78, 0.74, 0.66], look: [1.0, 0.9984, 0.55, 0], wear: [1, 1, 1], ink: 0.31 },
  ceramic: { family: 'paint', base: [0.86, 0.87, 0.85], look: [0.75, 0.996, 0.4, 0], wear: [0.6, 0, 0], ink: 0.62 },
  chrome: { family: 'metal', base: [0.92, 0.94, 0.97], look: [1.0, 0.9992, 0.35, 0], wear: [0.7, 0.4, 0], ink: 0.5 },
  steel: { family: 'metal', base: [0.36, 0.37, 0.39], look: [0.45, 0.994, 0.2, 0], wear: [1, 1, 0], ink: 0.81 },
  alu: { family: 'metal', base: [0.62, 0.63, 0.64], look: [0.55, 0.992, 0.25, 0], wear: [1, 0.3, 0], ink: 0.12 },
  trim: { family: 'matte', base: [0.028, 0.03, 0.034], look: [0.18, 0.99, 0.3, 0.0], pattern: 6, wear: [1, 0, 0.5], ink: 0.25 },
  rubber: { family: 'matte', base: [0.03, 0.03, 0.033], look: [0.06, 0.97, 0.45, 0.25], pattern: 4, wear: [1, 0, 0.6], ink: 0.75 },
  rust: { family: 'matte', base: [0.3, 0.1, 0.035], look: [0.0, 0.98, 0.15, 0.0], pattern: 5, wear: [1, 0, 0], ink: 0.43 },
  fabric: { family: 'matte', base: [0.2, 0.12, 0.085], look: [0.0, 0.98, 0.0, 0.5], pattern: 1, cabin: true, ink: 0.93 },
  leather: { family: 'matte', base: [0.2, 0.075, 0.035], look: [0.25, 0.985, 0.2, 0.15], pattern: 2, cabin: true, ink: 0.56 },
  wood: { family: 'matte', base: [0.36, 0.17, 0.07], look: [0.4, 0.993, 0.2, 0.0], pattern: 3, cabin: true, ink: 0.68 },
  plastic_int: { family: 'matte', base: [0.07, 0.068, 0.07], look: [0.1, 0.985, 0.15, 0.1], pattern: 6, cabin: true, ink: 0.37 },
  glass: { family: 'glass', base: [0.012, 0.018, 0.024], look: [1.0, 0.9992, 0.0, 0], tint: [0.05, 0.08, 0.1], opacity: 0.5, wear: [0.6, 0, 0], ink: 0.0 },
  glass_dark: { family: 'glass', base: [0.004, 0.006, 0.008], look: [1.0, 0.9992, 0.0, 0], tint: [0.012, 0.016, 0.02], opacity: 0.86, wear: [0.6, 0, 0], ink: 0.0 },
  lens_head: { family: 'lens', base: [0.8, 0.82, 0.84], look: [1.0, 0.9992, 0.3, 0], tint: [1.0, 0.86, 0.62], opacity: 0.18, wear: [0.6, 0, 0], ink: 0.0 },
  lens_tail: { family: 'lens', base: [0.5, 0.02, 0.012], look: [1.0, 0.9992, 0.3, 0], tint: [1.0, 0.1, 0.045], opacity: 0.72, wear: [0.6, 0, 0], ink: 0.0 },
  lens_amber: { family: 'lens', base: [0.75, 0.3, 0.02], look: [1.0, 0.9992, 0.3, 0], tint: [1.0, 0.45, 0.05], opacity: 0.66, wear: [0.6, 0, 0], ink: 0.0 },
  gauge: { family: 'gauge', base: [0.8, 0.77, 0.68], look: [0.3, 0.99, 0.0, 0], cabin: true, ink: 0.18 },
  emit: { family: 'emit', base: [1.0, 0.78, 0.45], look: [0, 0, 0, 0], ink: 0.87 },
};

/**
 * Uniforms the whole scene shares with car materials: what the ground under the cars looks like in
 * their reflections (the game sets it from the road and the country; the viewer from its floor).
 */
export const carEnvUniforms = {
  uCarGround: { value: new THREE.Color(0.2, 0.21, 0.17) },
  /** debug views for modellers (viewer ?debug=): 0 off, 1 baked AO, 2 flat colour per material, 3 normals */
  uCarDebug: { value: 0 },
};

export interface CarLookOptions {
  /** main paint (paint) and second paint (paint_b), sRGB hex or THREE.Color */
  paint?: THREE.ColorRepresentation;
  paint2?: THREE.ColorRepresentation;
  /** 0…1 for the whole car (merged meshes add their own per vertex) */
  dirt?: number;
  rust?: number;
  wear?: number;
}

export interface CarLights {
  /** 0 off, 1 low beam, 2 high beam */
  head?: number;
  /** tail lamps on (with the head lamps) */
  tail?: boolean;
  /** brake lamps 0…1 */
  brake?: number;
  turnLeft?: boolean;
  turnRight?: boolean;
  /** reversing lamps (white lens_head segments in the tail lamps light with the head lamps too) */
  reverse?: boolean;
  /** instrument lighting 0…1; −1 = with the head lamps */
  dash?: number;
}

// ------------------------------------------------------------------------------------------ GLSL

const GLSL_CAR_VERTEX = /* glsl */ `
  ${GLSL_VERTEX_PARS}
  uniform mat4 uWorldToCar;
  varying vec3 vObj;    // object-space position: patterns stick to the part
  varying vec3 vObjN;   // object-space normal (triplanar patterns)
  varying vec3 vCar;    // position in the car's frame: height above its ground for dirt
  varying float vAO;    // baked ambient occlusion (vertex colour)
  varying vec2 vUv;
  #ifdef RT_VPAINT
  attribute vec3 aPaint;
  varying vec3 vPaint;
  #endif
  #ifdef RT_VWEAR
  attribute vec3 aWear;
  varying vec3 vWear;
  #endif
  #ifdef RT_VPART
  attribute float aPartId;
  varying float vPartId;
  #endif
  void main() {
    vec3 transformed = position;
    vec3 objNormal = normal;
    vObj = position;
    vObjN = normal;
    vUv = uv;
    #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    vAO = color.r;
    #else
    vAO = 1.0;
    #endif
    #ifdef RT_VPAINT
    vPaint = aPaint;
    #endif
    #ifdef RT_VWEAR
    vWear = aWear;
    #endif
    #ifdef RT_VPART
    vPartId = aPartId;
    #endif
    ${GLSL_VERTEX_MAIN}
    vCar = (uWorldToCar * rtWorld).xyz;
  }
`;

const GLSL_CAR_FRAGMENT = /* glsl */ `
  ${GLSL_FRAGMENT_PARS}
  ${GLSL_COMMON}
  uniform vec3 uBase;
  uniform vec4 uLook;          // gloss, sun spot (cos of its radius), rim, sheen
  uniform vec3 uWearMax;       // how much dirt, rust, fading this material shows
  uniform vec3 uWear;          // the car's dirt, rust, fading
  uniform float uPattern;
  uniform float uInkSeed;
  uniform vec4 uHighlight;     // rgb, strength 0…1
  uniform float uHighlightId;  // merged meshes: the part to light (aPartId); < 0 = the whole material
  uniform vec3 uTint;          // glass: tint; lens: the lamp's light
  uniform float uOpacity;
  uniform float uLamp;         // lens / gauge / emit: how bright the lamp behind is (0 = off)
  uniform vec3 uCarGround;
  uniform float uCarDebug;
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform float uSunVis;
  uniform samplerCube tClouds;
  uniform float uCloudsOn;
  varying vec3 vObj;
  varying vec3 vObjN;
  varying vec3 vCar;
  varying float vAO;
  varying vec2 vUv;
  #ifdef RT_VPAINT
  varying vec3 vPaint;
  #endif
  #ifdef RT_VWEAR
  varying vec3 vWear;
  #endif
  #ifdef RT_VPART
  varying float vPartId;
  #endif

  float rtLuma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

  // a hard step one pixel soft, so painted band edges neither crawl nor blur
  float rtStep(float x, float soft) {
    float w = fwidth(x) * 0.8 + soft;
    return smoothstep(-w, w, x);
  }

  // patterns in the part's own space, projected three ways (a part has no useful UVs of its own)
  vec4 rtTriNoise(vec3 p, vec3 n, float metres) {
    vec3 w = abs(n);
    w = w * w * w;
    w /= (w.x + w.y + w.z + 1e-4);
    float k = 1.0 / metres;
    return texture2D(tNoise, p.yz * k) * w.x + texture2D(tNoise, p.xz * k + 0.37) * w.y + texture2D(tNoise, p.xy * k + 0.71) * w.z;
  }
  float rtTriStroke(vec3 p, vec3 n, float metres) {
    vec3 w = abs(n);
    w = w * w * w;
    w /= (w.x + w.y + w.z + 1e-4);
    float k = 1.0 / metres;
    return texture2D(tStrokes, p.yz * k).r * w.x + texture2D(tStrokes, p.xz * k + 0.29).r * w.y + texture2D(tStrokes, p.xy * k + 0.53).r * w.z;
  }

  // ---- the world in a glossy body, as an anime painter lays it in: the sky in hard bands (palest just
  // over the horizon), the far land a dark band under it, then the ground. Masks and colours apart, so each
  // family puts them on its own way: paint lays them over its colour (most of a panel keeps it, the bands
  // run along the body and slide as the eye moves), chrome is nothing but them.
  struct CarEnv {
    vec3 bright;  // the band of sky just over the horizon
    vec3 upper;   // the open sky above it
    vec3 land;    // the far land, dark, under the horizon
    vec3 ground;  // the ground near the car
    float sky;    // 1 above the horizon
    float band;   // 1 in the bright band (with sky)
    float dark;   // 1 in the dark band (without sky)
    float line;   // a thin bright line on the horizon itself
    float cloud;  // a cloud in the sky part
  };
  CarEnv rtCarEnv(vec3 R, float soft) {
    CarEnv e;
    float h = R.y;
    // the far tree line and hills: a painted silhouette that stays put in the world
    float az = atan(R.z, R.x);
    float hz = 0.007 * sin(az * 2.0 + 1.3) + 0.004 * sin(az * 5.0 + 0.4) - 0.012;
    float x = h - hz;
    // the sky is brightest round the sun: the band swells towards it and dims away from it, so it changes
    // along the body instead of running round it like a painted stripe
    vec2 rs = normalize(R.xz + vec2(1e-5));
    vec2 ss = normalize(uSunDir.xz + vec2(1e-5));
    float toSun = dot(rs, ss) * 0.5 + 0.5;
    e.bright = (mix(uHorizon, vec3(rtLuma(uHorizon)), 0.2) * 1.15 + uGlow * 0.25 * uSunVis * toSun * toSun) * (0.78 + 0.34 * toSun);
    e.upper = mix(uMid, uZenith, smoothstep(0.42, 0.85, h));
    // the sky's own clouds, as the dome draws them (hard-edged already): a hood mirrors them
    e.cloud = 0.0;
    if (uCloudsOn > 0.5 && h > -0.02) {
      vec4 cl = textureCube(tClouds, vec3(R.x, max(h, 0.02), R.z));
      e.upper = e.upper * (1.0 - cl.a) + cl.rgb;
      e.bright = e.bright * (1.0 - cl.a * 0.6) + cl.rgb * 0.6;
      e.cloud = cl.a;
    }
    e.land = mix(uHereForest, uCarGround, 0.35) * (uSkyColor * 0.55 + uSunColor * 0.06);
    e.ground = uCarGround * (uSkyColor * 0.7 + uSunColor * 0.22 * smoothstep(-0.1, 0.3, uSunDir.y));
    e.sky = rtStep(x, soft);
    e.band = 1.0 - rtStep(x - 0.21, soft);
    e.dark = 1.0 - rtStep(-x - 0.14, soft);
    e.line = e.sky * (1.0 - rtStep(x - 0.02, soft));
    return e;
  }

  // a crisp sun spot (and a soft halo round it), as the clear coat mirrors it
  float rtSunSpot(vec3 R, float cosR) {
    float d = dot(R, uSunDir);
    return smoothstep(cosR, cosR + (1.0 - cosR) * 0.35, d) + 0.06 * pow(max(d, 0.0), 300.0);
  }

  // ---- wear: hand-painted masks, not photographs of dirt
  // Dirt as a painter puts it on a car, in broad shapes with brushed edges (never a speckle):
  //   mud   splashed up from the wheels: a hem along the bottom with a ragged top, higher the dirtier
  //   dust  over the rest, thicker low down and in the crevices, in long runs where rain streaked it
  void rtDirtMasks(float amount, vec3 p, vec3 n, float height, float ao, out float dust, out float mud) {
    float brush = rtTriStroke(p, n, 0.9) - 0.5;
    float big = rtTriNoise(p, n, 2.4).r - 0.5;
    float hem = amount * 0.62 - 0.06 + big * 0.26 + brush * 0.12;
    mud = rtStep(hem - height, 0.006) * step(0.02, amount);
    // rain runs: noise stretched down the side of the part (its own vertical), fine across, long down
    vec2 side = abs(n.x) > abs(n.z) ? p.zy : p.xy;
    float runs = texture2D(tNoise, side * vec2(1.6, 0.12)).g - 0.5;
    float low = 1.0 - smoothstep(0.05, 1.35, height);
    float d = amount * (0.42 + 0.5 * low) + (1.0 - ao) * 0.55 * amount + runs * 0.45 * amount * (1.0 - abs(n.y)) + brush * 0.25 * amount + big * 0.2 * amount;
    dust = rtStep(d - 0.52, 0.02) * 0.6 + rtStep(d - 0.75, 0.02) * 0.3;
    dust *= step(0.02, amount);
  }
  // Rust starts in the crevices, along the bottom of panels and round the arches, eats outwards in big
  // blotches, and lifts the paint round its edge (a pale blistered rim)
  float rtRust(float amount, vec3 p, vec3 n, float height, float ao, out float rim) {
    float patches = rtTriNoise(p, n, 2.2).g - 0.5;
    float ragged = rtTriStroke(p + 3.7, n, 0.7) - 0.5;
    float field = 0.48 * (1.0 - ao) + 0.32 * (1.0 - smoothstep(0.18, 0.8, height)) + patches * 0.62 + ragged * 0.16;
    float thr = 0.9 - amount * 1.0;
    rim = rtStep(field - thr + 0.045, 0.004) * step(0.02, amount);
    return rtStep(field - thr, 0.004) * step(0.02, amount);
  }
  // bare rusty iron in two painted tones (dark scale, orange bloom) and a few pits, lit as the rest
  vec3 rtRustColor(vec3 p, vec3 n, vec3 light, float ao) {
    float t = rtTriNoise(p, n, 0.9).b * 0.75 + (rtTriStroke(p, n, 0.35) - 0.5) * 0.5;
    vec3 c = mix(vec3(0.075, 0.028, 0.013), vec3(0.3, 0.1, 0.028), rtStep(t - 0.5, 0.01));
    c = mix(c, vec3(0.42, 0.17, 0.05), rtStep(t - 0.68, 0.01) * 0.7);
    return c * light * mix(0.6, 1.0, ao);
  }

  // ink: an id below the paint finish's 0.23, from the material and its colour: neighbouring parts of
  // different materials or colours get a line between them (frame.ts inkAt)
  float rtCarInk(vec3 base) {
    return 0.04 + 0.17 * fract(uInkSeed + fract(dot(floor(base * 23.0 + 0.5), vec3(0.1031, 0.1137, 0.0973)) * 7.0) * 0.43);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 n = normalize(vNormal);
    #ifdef RT_DOUBLE
    if (!gl_FrontFacing) n = -n;
    #endif
    vec3 toEye = cameraPosition - vPos;
    float dist = length(toEye);
    vec3 v = toEye / max(dist, 1e-4);
    float ndv = clamp(dot(n, v), 0.0, 1.0);
    vec3 R = reflect(-v, n);
    float ao = clamp(vAO, 0.0, 1.0);
    vec3 base = uBase;
    #ifdef RT_VPAINT
    base = vPaint;
    #endif
    vec3 wear = uWear;
    #ifdef RT_VWEAR
    wear += vWear;
    #endif
    wear = clamp(wear, 0.0, 1.0) * uWearMax;
    float height = vCar.y;
    vec3 on = normalize(vObjN);
    float sh = rtShadow(vPos, n);
    #ifdef RT_CABIN
    // without shadow maps nothing keeps the sun out of the cabin: let a third of it in
    sh *= mix(0.35, 1.0, uShadowParams.x);
    #endif
    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.015, 0.05, ndl) * sh;
    float full = smoothstep(0.4, 0.52, ndl) * sh;
    vec3 sky = mix(uBounceColor * 2.0, uSkyColor, n.y * 0.5 + 0.5) * 0.9;
    vec3 col = vec3(0.0);
    float alpha = 1.0;
    float gloss = uLook.x;
    vec3 inkBase = base;

    // ---------------------------------------------------------------- dirt, rust (masks; applied per family)
    float dust = 0.0;
    float mud = 0.0;
    float rust = 0.0;
    float rustEdge = 0.0;
    #ifdef RT_WEAR
    rtDirtMasks(wear.x, vObj, on, height, ao, dust, mud);
    rust = rtRust(wear.y, vObj, on, height, ao, rustEdge);
    #endif

    #if defined(RT_PAINT)
    // ---------------------------------------------------------------- car paint
    vec3 paint = base;
    // fading: sun-bleached, chalky, the gloss gone — more on top, in drifts
    float fade = wear.z * smoothstep(0.25, 0.75, rtTriNoise(vObj, on, 0.9).a * 0.7 + n.y * 0.4 + 0.15);
    paint = mix(paint, mix(vec3(rtLuma(paint)), paint, 0.55) * 1.25 + 0.04, fade * 0.75);
    // the shade tone is tuned on its own: deeper and more saturated than the lit one, cooled by the sky
    float pk = max(max(paint.r, paint.g), max(paint.b, 1e-3));
    vec3 shadeTone = paint * mix(vec3(1.0), paint / pk, 0.45) * 0.86;
    // (a crevice the shadow maps cannot see into — a panel gap, under a trim strip — is kept from the sun by the AO)
    float sunAO = smoothstep(0.12, 0.62, ao);
    vec3 diffuse = mix(shadeTone * sky * mix(0.55, 1.0, ao), paint * (sky * mix(0.7, 1.0, ao) + uSunColor * (0.3 + 0.08 * full) * sunAO), lit);
    col = diffuse;
    // the clear coat: light laid over the colour, never a wash of grey across it
    CarEnv e = rtCarEnv(R, 0.0015);
    float f = 0.3 + 0.7 * pow(1.0 - ndv, 3.0);
    float coat = gloss * mix(0.3, 1.0, ao) * (1.0 - fade * 0.8) * mix(0.8, 1.0, lit);
    // what the coat mirrors is tinted by the colour under it: the bands stay a light tone of the paint
    // (blue sky added to red reads salmon pink once it is in sRGB)
    vec3 hue = paint / pk;
    vec3 upperT = mix(e.upper, vec3(rtLuma(e.upper)) * hue, 0.62);
    vec3 brightT = mix(e.bright, vec3(rtLuma(e.bright)) * hue, 0.82);
    col += upperT * (0.07 + 0.22 * f) * e.sky * (1.0 - e.band) * coat;
    col += brightT * (0.4 + 0.38 * f) * e.band * e.sky * coat;
    col += e.bright * 0.3 * e.line * coat;
    // under the horizon the far land deepens the colour; the ground near by gives back a little light
    float under = 1.0 - e.sky;
    col = mix(col, col * 0.4 + e.land * 0.6, e.dark * under * (0.5 + 0.35 * f) * coat);
    col += e.ground * 0.12 * f * (1.0 - e.dark) * under * coat;
    // crisp light along creases and tight curves (where the normal turns fast across the screen), on the
    // sides that face the sky: the anime edge highlight that draws a body's lines
    float crease = smoothstep(0.35, 1.2, length(fwidth(n)) * 9.0) * smoothstep(-0.2, 0.6, n.y);
    col += (e.bright * 0.4 + uSunColor * 0.12 * lit) * crease * coat * 0.8;
    // the sun in the clear coat: small and white-hot (the bloom catches it)
    col += uSunColor * 1.6 * rtSunSpot(R, uLook.y) * sh * gloss * (1.0 - fade);
    // rim: the edge turned away catches the sky
    col += (uSkyColor * 0.5 + uHorizon * 0.25) * uLook.z * pow(1.0 - ndv, 5.0) * ao;
    #ifdef RT_WEAR
    // rust breaks through; the paint round it lifts and pales
    col = mix(col, diffuse * 1.18 + 0.012, rustEdge * (1.0 - rust) * 0.5);
    col = mix(col, rtRustColor(vObj, on, sky + uSunColor * 0.32 * lit, ao), rust);
    #endif

    #elif defined(RT_METAL)
    // ---------------------------------------------------------------- chrome, steel, aluminium
    float contrast = gloss;
    CarEnv e = rtCarEnv(R, mix(0.03, 0.001, contrast));
    vec3 diffuse = base * (sky * mix(0.6, 1.0, ao) + uSunColor * (0.3 * lit + 0.08 * full) * smoothstep(0.12, 0.62, ao));
    // chrome: nothing but the bands, pushed hard (bright sky, a white line on the horizon, a near black
    // band under it, warm ground); steel and aluminium: the same, softened over a grey cel tone
    vec3 skyc = mix(e.upper * 1.15, e.bright * 1.45, e.band);
    vec3 under = mix(e.ground * 1.3, e.land * mix(1.0, 0.25, contrast), e.dark);
    vec3 env = mix(under, skyc, e.sky);
    env = mix(env, e.bright * 2.2 + 0.1, e.line * contrast);
    // a metal is what it mirrors (its gloss is how much): no white diffuse washing chrome flat
    float fres = mix(0.75, 1.0, pow(1.0 - ndv, 3.0));
    col = mix(diffuse, env * base * mix(0.85, 1.2, contrast), clamp(gloss * mix(fres, 1.0, contrast), 0.0, 1.0)) * mix(0.45, 1.0, ao);
    col += uSunColor * mix(0.5, 2.4, contrast) * rtSunSpot(R, uLook.y) * sh;
    col += uSkyColor * uLook.z * pow(1.0 - ndv, 4.0) * ao;
    #ifdef RT_WEAR
    col = mix(col, rtRustColor(vObj, on, sky + uSunColor * 0.3 * lit, ao), rust);
    #endif

    #elif defined(RT_MATTE)
    // ---------------------------------------------------------------- matte things: plastics, rubber, cloth, wood, rust
    vec3 albedo = base;
    int pat = int(uPattern + 0.5);
    float sheenMask = 1.0;
    if (pat == 1) {
      // cloth: a fine weave and a soft nap
      vec2 q = (abs(on.x) > 0.5 ? vObj.yz : abs(on.y) > 0.5 ? vObj.xz : vObj.xy) * 260.0;
      float weave = 0.5 + 0.25 * (sin(q.x) * sin(q.y));
      albedo *= 0.9 + 0.2 * weave * (1.0 - smoothstep(1.5, 4.0, dist));
      albedo *= 0.88 + 0.24 * rtTriNoise(vObj, on, 0.3).g;
    } else if (pat == 2) {
      // leather: soft grain, darker where it creases (AO)
      albedo *= 0.85 + 0.3 * rtTriNoise(vObj, on, 0.035).b;
      albedo *= mix(0.65, 1.0, ao);
    } else if (pat == 3) {
      // wood: grain along the part, figure lines bent by a slow wobble
      float g = vObj.x * 1.0 + vObj.y * 0.15 + (rtTriNoise(vObj, on, 0.2).r - 0.5) * 0.06;
      float rings = abs(fract(g * 38.0) - 0.5) * 2.0;
      albedo *= mix(0.62, 1.12, smoothstep(0.15, 0.85, rings)) * (0.9 + 0.2 * rtTriNoise(vObj, on, 0.08).a);
    } else if (pat == 4) {
      // rubber: matte, a touch lighter where worn
      albedo *= 0.9 + 0.25 * rtTriNoise(vObj, on, 0.1).g;
    } else if (pat == 5) {
      // rusty metal: brown with orange flakes and dark pits
      float f = rtTriNoise(vObj, on, 0.06).r;
      float p = rtTriNoise(vObj, on, 0.22).g;
      albedo = mix(vec3(0.06, 0.022, 0.01), vec3(0.4, 0.14, 0.04), smoothstep(0.25, 0.8, f * 0.7 + p * 0.5));
      sheenMask = 0.0;
    } else if (pat == 6) {
      // plastic: a faint pebble
      albedo *= 0.94 + 0.12 * rtTriNoise(vObj, on, 0.05).b;
    }
    #ifdef RT_CABIN
    col = rtCabin(albedo, n, sh) * mix(0.45, 1.0, ao);
    #else
    col = albedo * (sky * mix(0.55, 1.0, ao) + uSunColor * (0.3 * lit + 0.1 * full) * smoothstep(0.12, 0.62, ao));
    #endif
    // a broad soft highlight (shiny plastic, leather, lacquer) and a sheen at grazing angles (cloth, rubber)
    vec3 hv = normalize(v + uSunDir);
    float spec = smoothstep(uLook.y - 0.03, uLook.y, dot(n, hv)) * step(0.0, ndl) * sh;
    col += uSunColor * gloss * 0.25 * spec * sheenMask;
    col += (uSkyColor * 0.6 + uSunColor * 0.12 * lit) * uLook.w * pow(1.0 - ndv, 3.0) * ao * sheenMask;
    col += uSkyColor * 0.35 * uLook.z * pow(1.0 - ndv, 5.0) * ao;
    #ifdef RT_WEAR
    col = mix(col, rtRustColor(vObj, on, sky + uSunColor * 0.3 * lit, ao), rust);
    #endif

    #elif defined(RT_GLASS)
    // ---------------------------------------------------------------- glass: dark tint, the world in it, streaks
    CarEnv e = rtCarEnv(R, 0.002);
    vec3 env = mix(mix(e.ground, e.land, e.dark), mix(e.upper, e.bright, e.band), e.sky);
    float ew = mix(mix(0.3, 0.6, e.dark), mix(0.45, 1.0, e.band), e.sky);
    // (glass in a drawing mirrors more than glass does: a windscreen seen at a slant is mostly sky)
    float fres = 0.14 + 0.86 * pow(1.0 - ndv, 2.5);
    // what comes through: the tint, lit by the sky (premultiplied: the glass covers uOpacity of what is behind)
    vec3 through = uTint * (uSkyColor * 0.9 + uSunColor * 0.06) * uOpacity;
    vec3 refl = env * fres * mix(0.45, 1.0, ew) * 0.85;
    // streaks: two diagonal bands across the glass, sliding a little with the eye
    vec3 sd = normalize(vec3(-0.55, 1.0, 0.0));
    float s = dot(vObj, sd) * 1.6 + dot(v, vec3(0.0, 0.6, 0.35)) * 0.5;
    float fs = fract(s);
    float streak = rtStep(fs - 0.32, 0.004) * (1.0 - rtStep(fs - 0.44, 0.004)) + 0.7 * rtStep(fs - 0.5, 0.003) * (1.0 - rtStep(fs - 0.535, 0.003));
    streak *= 0.34 * (0.35 + 0.65 * smoothstep(0.0, 0.5, dot(uSkyColor, vec3(0.33)))) * (1.0 - smoothstep(25.0, 60.0, dist));
    col = through + refl + (uHorizon * 0.8 + 0.25) * streak;
    col += uSunColor * 3.0 * rtSunSpot(R, uLook.y) * sh;
    alpha = clamp(uOpacity + fres * 0.45 + streak, 0.0, 0.97);
    #ifdef RT_WEAR
    // dust on the glass: a pale haze from the bottom edge
    float haze = wear.x * (1.0 - smoothstep(0.55, 1.15, height)) * (0.55 + 0.45 * rtTriNoise(vObj, on, 1.2).r);
    col = mix(col, vec3(0.32, 0.28, 0.22) * (sky + uSunColor * 0.2) * alpha, haze * 0.5);
    alpha = mix(alpha, 0.85, haze * 0.4);
    #endif

    #elif defined(RT_LENS)
    // ---------------------------------------------------------------- lamp lenses
    CarEnv e = rtCarEnv(R, 0.002);
    vec3 env = mix(mix(e.ground, e.land, e.dark), mix(e.upper, e.bright, e.band), e.sky);
    float fres = 0.1 + 0.9 * pow(1.0 - ndv, 4.0);
    // the lens's own optics: fine rings round the lamp's centre (UV 0.5, 0.5), glinting as the eye moves
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float rings = abs(fract(r * 7.0 + dot(v, n) * 0.6) - 0.5) * 2.0;
    float glint = smoothstep(0.75, 0.95, rings) * (1.0 - smoothstep(0.85, 1.0, r));
    vec3 tinted = base * (uSkyColor * 0.55 + uSunColor * 0.12 * lit);
    col = tinted * uOpacity + env * fres * 0.8 + uSunColor * 2.4 * rtSunSpot(R, uLook.y) * sh;
    col += base * (uSkyColor * 0.3 + uSunColor * 0.1) * glint * 0.4;
    alpha = clamp(uOpacity + fres * 0.4 + glint * 0.12, 0.0, 0.95);
    // lit: the face glows, hottest over the bulb, and bloom spreads it
    float hot = 1.0 - smoothstep(0.0, 0.9, r);
    vec3 glow = uTint * uLamp * (0.55 + 0.75 * hot * hot) * (0.7 + 0.3 * ndv);
    float on01 = smoothstep(0.0, 0.25, uLamp);
    col = mix(col, glow + env * fres * 0.25, on01);
    alpha = mix(alpha, 0.97, on01);

    #elif defined(RT_GAUGE)
    // ---------------------------------------------------------------- a dial from the UVs
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float a = atan(c.y, c.x);
    // 240° of scale, from bottom left round over the top to bottom right
    float t = (3.92699 - a) / 4.18879;
    t = t > 1.25 ? t - 1.5 : t;
    float onScale = step(0.0, t) * step(t, 1.0);
    float major = 1.0 - smoothstep(0.02, 0.035, abs(fract(t * 8.0 + 0.5) - 0.5));
    float minor = 1.0 - smoothstep(0.06, 0.12, abs(fract(t * 40.0 + 0.5) - 0.5));
    float ticks = onScale * max(major * step(0.68, r), minor * step(0.8, r)) * step(r, 0.92);
    float red = onScale * step(0.82, t) * step(0.84, r) * step(r, 0.92);
    vec3 face = mix(base, vec3(0.04, 0.035, 0.03), ticks);
    face = mix(face, vec3(0.55, 0.05, 0.03), red);
    face = mix(face, vec3(0.06, 0.055, 0.05), step(0.96, r));
    col = rtCabin(face, n, sh) * mix(0.6, 1.0, ao);
    // instrument lighting: a warm glow through the face and brighter ticks
    col += face * vec3(1.0, 0.72, 0.42) * uLamp * 0.5 * (1.0 - ticks) + vec3(1.0, 0.6, 0.25) * uLamp * 0.4 * ticks;
    vec3 hv = normalize(v + uSunDir);
    col += uSunColor * 0.25 * smoothstep(0.985, 0.995, dot(n, hv)) * sh;

    #elif defined(RT_EMIT)
    // ---------------------------------------------------------------- self-lit
    col = base * uLamp;
    #endif

    #if !defined(RT_GLASS) && !defined(RT_LENS) && !defined(RT_EMIT)
    #ifdef RT_WEAR
    // dirt over everything: pale dust, dark mud low down (both matte: they kill the gloss under them)
    vec3 dirtLight = sky * mix(0.55, 1.0, ao) + uSunColor * 0.3 * lit;
    col = mix(col, vec3(0.3, 0.26, 0.205) * dirtLight, dust * (1.0 - mud));
    col = mix(col, mix(vec3(0.085, 0.065, 0.045), vec3(0.14, 0.11, 0.075), rtStep(rtTriStroke(vObj, on, 0.5) - 0.55, 0.01)) * dirtLight, mud);
    #endif
    #endif

    #if !defined(RT_CABIN) && !defined(RT_EMIT)
    // the beams of a car's head lamps light it, and catch in a glossy surface
    vec3 lb = base;
    #if defined(RT_GLASS) || defined(RT_LENS)
    lb = vec3(0.08);
    #endif
    col += rtHeadlight(lb, n, vPos);
    {
      vec3 Lh = normalize(uHeadPos - vPos);
      float cone = smoothstep(0.86, 0.975, dot(-Lh, uHeadDir));
      col += uHeadColor * cone * smoothstep(0.985, 0.995, dot(R, Lh)) * gloss * 0.8;
    }
    #endif

    // the part one is looking at: a rim of light that breathes
    {
      float hl = uHighlight.w;
      #ifdef RT_VPART
      hl *= uHighlightId < 0.0 ? 1.0 : 1.0 - step(0.5, abs(vPartId - uHighlightId));
      #endif
      if (hl > 0.0) {
        float pulse = 0.75 + 0.25 * sin(uTime * 4.0);
        col += uHighlight.rgb * hl * pulse * (0.12 + 1.1 * pow(1.0 - ndv, 2.5));
      }
    }

    col = rtFog(col, vPos, cameraPosition);

    if (uCarDebug > 0.5) {
      // what a modeller needs to see: the AO as baked, which material is where, the normals
      if (uCarDebug < 1.5) col = vec3(ao * ao);
      else if (uCarDebug < 2.5) col = (0.15 + 0.85 * fract(vec3(0.17, 0.53, 0.89) + uInkSeed * vec3(3.1, 5.7, 7.3))) * (0.55 + 0.45 * max(dot(n, normalize(vec3(0.4, 0.8, 0.45))), 0.0));
      else col = (n * 0.5 + 0.5) * 0.8;
      col *= 0.8;
    }

    #if defined(RT_GLASS) || defined(RT_LENS)
    gl_FragColor = vec4(col, alpha);
    #else
    gl_FragColor = vec4(col, rtCarInk(inkBase));
    #endif
  }
`;

// ------------------------------------------------------------------------------------------ materials

/** what a geometry carries, which picks the variant of a material */
interface Variant {
  ao: boolean;
  vpaint: boolean;
  vwear: boolean;
  vpart: boolean;
}

function variantOf(g: THREE.BufferGeometry): Variant {
  return { ao: g.hasAttribute('color'), vpaint: g.hasAttribute('aPaint'), vwear: g.hasAttribute('aWear'), vpart: g.hasAttribute('aPartId') };
}

const variantKey = (name: string, v: Variant): string => `${name}|${v.ao ? 'a' : ''}${v.vpaint ? 'p' : ''}${v.vwear ? 'w' : ''}${v.vpart ? 'i' : ''}`;

/** the materials of one car */
export class CarLook {
  private readonly mats = new Map<string, THREE.ShaderMaterial>();
  private readonly lights: Required<CarLights> = { head: 0, tail: false, brake: 0, turnLeft: false, turnRight: false, reverse: false, dash: -1 };
  readonly paint = new THREE.Color();
  readonly paint2 = new THREE.Color();
  /** shared by every material of this car */
  private readonly shared = {
    uWear: { value: new THREE.Vector3() },
    uWorldToCar: { value: new THREE.Matrix4() },
    uHighlight: { value: new THREE.Vector4(0.55, 0.92, 1.0, 0) },
    uHighlightId: { value: -1 },
  };
  /** names met in apply() that are not conventional (drawn as plastic_int) */
  readonly unknown = new Set<string>();
  /** meshes whose material was swapped for a highlight, and what they had */
  private readonly lit = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();

  constructor(opts: CarLookOptions = {}) {
    this.paint.set(opts.paint ?? 0x9e2f22);
    this.paint2.set(opts.paint2 ?? 0xe6dccb);
    this.shared.uWear.value.set(opts.dirt ?? 0, opts.rust ?? 0, opts.wear ?? 0);
  }

  /** the material for a conventional name (created on first use, then shared by every mesh like it) */
  material(name: CarMaterialName, v: Variant = { ao: true, vpaint: false, vwear: false, vpart: false }): THREE.ShaderMaterial {
    const key = variantKey(name, v);
    let m = this.mats.get(key);
    if (m) return m;
    m = this.build(name, v);
    this.mats.set(key, m);
    this.refresh();
    return m;
  }

  private build(name: CarMaterialName, v: Variant): THREE.ShaderMaterial {
    const r = RECIPES[name];
    const defines: Record<string, string> = { [`RT_${r.family.toUpperCase()}`]: '' };
    if (r.cabin) defines.RT_CABIN = '';
    if (r.wear && (r.wear[0] > 0 || r.wear[1] > 0 || r.wear[2] > 0)) defines.RT_WEAR = '';
    if (v.vpaint) defines.RT_VPAINT = '';
    if (v.vwear) defines.RT_VWEAR = '';
    if (v.vpart) defines.RT_VPART = '';
    const transparent = r.family === 'glass' || r.family === 'lens';
    if (transparent) defines.RT_DOUBLE = '';
    const base = new THREE.Color(r.base[0], r.base[1], r.base[2]);
    if (name === 'paint') base.copy(this.paint);
    if (name === 'paint_b') base.copy(this.paint2);
    const mat = new THREE.ShaderMaterial({
      defines,
      vertexColors: v.ao,
      side: transparent ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        ...globals,
        ...carEnvUniforms,
        uZenith: skyUniforms.uZenith,
        uMid: skyUniforms.uMid,
        uHorizon: skyUniforms.uHorizon,
        uGlow: skyUniforms.uGlow,
        uSunVis: skyUniforms.uSunVis,
        tClouds: skyUniforms.tClouds,
        uCloudsOn: skyUniforms.uCloudsOn,
        ...this.shared,
        uBase: { value: base },
        uLook: { value: new THREE.Vector4(...r.look) },
        uWearMax: { value: new THREE.Vector3(...(r.wear ?? [0, 0, 0])) },
        uPattern: { value: r.pattern ?? 0 },
        uInkSeed: { value: r.ink },
        uTint: { value: new THREE.Color(...(r.tint ?? [1, 1, 1])) },
        uOpacity: { value: r.opacity ?? 1 },
        uLamp: { value: name === 'emit' ? 2.2 : 0 },
      },
      vertexShader: GLSL_CAR_VERTEX,
      fragmentShader: GLSL_CAR_FRAGMENT,
    });
    if (transparent) {
      // premultiplied: the shader writes what the glass adds and alpha = how much of the back it hides;
      // the alpha channel (ink ids, paint mask) is kept as it is
      mat.transparent = true;
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.OneFactor;
      mat.blendDst = THREE.OneMinusSrcAlphaFactor;
      mat.blendSrcAlpha = THREE.ZeroFactor;
      mat.blendDstAlpha = THREE.OneFactor;
      mat.depthWrite = false;
    }
    mat.name = `car:${name}`;
    mat.userData.carName = name;
    return mat;
  }

  /** swap the materials of every mesh under root by their names; glass and lenses stay out of the shadow maps */
  apply(root: THREE.Object3D): this {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const v = variantOf(mesh.geometry);
      const swap = (m: THREE.Material): THREE.Material => {
        let n = carMaterialName(m.name);
        if (!n) {
          this.unknown.add(m.name || '(unnamed)');
          n = 'plastic_int';
        }
        return this.material(n, v);
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (mats.some((m) => m.transparent)) {
        mesh.renderOrder = 9;
        mesh.userData.carNoShadow = true;
      }
    });
    return this;
  }

  setPaint(c: THREE.ColorRepresentation): void {
    this.paint.set(c);
    this.refresh();
  }

  setPaint2(c: THREE.ColorRepresentation): void {
    this.paint2.set(c);
    this.refresh();
  }

  /** wear of the whole car (merged meshes add their own per vertex): dirt, rust, faded paint, 0…1 */
  setWear(w: { dirt?: number; rust?: number; wear?: number }): void {
    const u = this.shared.uWear.value;
    if (w.dirt !== undefined) u.x = w.dirt;
    if (w.rust !== undefined) u.y = w.rust;
    if (w.wear !== undefined) u.z = w.wear;
  }

  /** the car's frame (its root's world matrix): dirt is measured up from its ground */
  setCarFrame(matrixWorld: THREE.Matrix4): void {
    this.shared.uWorldToCar.value.copy(matrixWorld).invert();
  }

  setLights(l: CarLights): void {
    Object.assign(this.lights, l);
    this.refresh();
  }

  /**
   * Light up the part one is looking at: a mesh (or group) drawn on its own, or the part id of a merged
   * mesh (aPartId); null = none. The colour is the system's cyan-white unless given.
   */
  setHighlight(target: THREE.Object3D | number | null, color?: THREE.ColorRepresentation): void {
    for (const [mesh, m] of this.lit) mesh.material = m;
    this.lit.clear();
    const h = this.shared.uHighlight.value;
    if (color !== undefined) {
      const c = new THREE.Color(color);
      h.set(c.r, c.g, c.b, h.w);
    }
    this.shared.uHighlightId.value = typeof target === 'number' ? target : -1;
    h.w = typeof target === 'number' ? 1 : 0;
    if (target && typeof target !== 'number') {
      target.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        this.lit.set(mesh, mesh.material);
        const one = (m: THREE.Material): THREE.Material => this.highlighted(m as THREE.ShaderMaterial);
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(one) : one(mesh.material);
      });
    }
  }

  /** a material's twin that is lit up (same program: only uniforms differ) */
  private highlighted(m: THREE.ShaderMaterial): THREE.Material {
    const key = `hl|${m.uuid}`;
    let h = this.mats.get(key);
    if (!h) {
      h = m.clone();
      h.uniforms = { ...m.uniforms, uHighlight: { value: this.shared.uHighlight.value.clone().setW(1) }, uHighlightId: { value: -1 } };
      h.name = `${m.name}+hl`;
      h.userData.carName = m.userData.carName;
      this.mats.set(key, h);
    }
    return h;
  }

  /** push colours and lamps into the materials */
  private refresh(): void {
    const l = this.lights;
    const dash = l.dash >= 0 ? l.dash : l.head > 0 ? 1 : 0;
    for (const m of this.mats.values()) {
      const n = m.userData.carName as CarMaterialName | undefined;
      const u = m.uniforms;
      if (n === 'paint') u.uBase.value.copy(this.paint);
      else if (n === 'paint_b') u.uBase.value.copy(this.paint2);
      else if (n === 'lens_head') u.uLamp.value = l.head > 0 ? (l.head > 1 ? 4.2 : 3.2) : l.reverse ? 2.2 : 0;
      else if (n === 'lens_tail') u.uLamp.value = (l.tail ? 1.1 : 0) + l.brake * 3.0;
      else if (n === 'lens_amber') u.uLamp.value = l.turnLeft || l.turnRight ? 3.0 : 0;
      else if (n === 'gauge') u.uLamp.value = dash;
    }
  }

  /** every material this car uses (for counting programs, disposing) */
  get materials(): THREE.ShaderMaterial[] {
    return [...this.mats.values()];
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}

/** swap a loaded model's materials for the car materials (see CarLook) */
export function applyCarMaterials(root: THREE.Object3D, opts: CarLookOptions = {}): CarLook {
  return new CarLook(opts).apply(root);
}

/** cast shadows from a car's opaque meshes (glass and lenses let the light through) */
export function carShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh || o.userData.carNoShadow) return;
    o.layers.enable(LAYER_SHADOW_FAR);
    o.layers.enable(LAYER_SHADOW_NEAR);
  });
}

// ------------------------------------------------------------------------------------------ ghosts

export type GhostKind = 'empty' | 'replace' | 'blocked';

const ghosts = new Map<string, THREE.ShaderMaterial>();

/**
 * The hologram of a part that can be installed (docs/MODCAR.md §5.2): cyan-white light added on top of
 * the frame, bright at the rim, horizontal scanlines drifting up, breathing slowly. 'replace' is fainter
 * (a part is already there), 'blocked' is orange-red. No depth write, never in the shadow maps. One
 * material per kind (and one more for the ghost one aims at), shared by every ghost.
 */
export function ghostMaterial(kind: GhostKind, focused = false): THREE.ShaderMaterial {
  const key = `${kind}${focused ? '+' : ''}`;
  let m = ghosts.get(key);
  if (m) return m;
  const color = kind === 'blocked' ? new THREE.Color(1.0, 0.3, 0.1) : new THREE.Color(0.32, 0.85, 1.0);
  m = new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uGhostColor: { value: color },
      // x: fill, y: rim, z: scanlines, w: brightness
      uGhost: { value: new THREE.Vector4(kind === 'replace' ? 0.05 : 0.12, kind === 'replace' ? 1.0 : 1.7, kind === 'replace' ? 0.5 : 1.0, focused ? 1.6 : 1.0) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uGhostColor;
      uniform vec4 uGhost;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        if (!gl_FrontFacing) n = -n;
        vec3 v = normalize(cameraPosition - vPos);
        float ndv = abs(dot(n, v));
        float rim = pow(1.0 - ndv, 2.6);
        // edges of the model's own form: where the normal turns fast across the screen
        float crease = clamp(length(fwidth(n)) * 2.5, 0.0, 1.0);
        float breathe = 0.78 + 0.22 * sin(uTime * 2.2);
        // scanlines in the world, drifting up; a brighter one sweeps up through the part now and then
        float y = vPos.y + uOriginOffset.y;
        float lines = smoothstep(0.3, 0.5, abs(fract(y * 26.0 - uTime * 0.5) - 0.5));
        float sweep = exp(-pow(fract(y * 0.6 - uTime * 0.35) - 0.5, 2.0) * 900.0);
        float k = uGhost.x + uGhost.y * rim + uGhost.y * 0.35 * crease + uGhost.z * 0.12 * lines + 0.35 * sweep;
        k *= breathe * uGhost.w;
        // saturated colour in the body of the skin, going white only where it is brightest (the rim)
        vec3 c = uGhostColor * k + vec3(1.0) * rim * rim * 0.5 * uGhost.w;
        gl_FragColor = vec4(c, 0.5);
      }`,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    // alpha keeps the smaller of what is there and 0.5: the paint finish leaves the hologram alone, and
    // the ink ids of the car under it (< 0.23) survive
    blendEquationAlpha: THREE.MinEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  m.name = `ghost:${key}`;
  ghosts.set(key, m);
  return m;
}

let ghostDepth: THREE.Material | null = null;

/**
 * Draw a whole model as a ghost of the given kind, out of the shadow maps. Each mesh gets a depth-only twin
 * drawn just before it, so the hologram is one skin (the surface nearest the eye), not every layer of the
 * part added up to white. Two draw calls per mesh; ghosts are few.
 */
export function applyGhost(root: THREE.Object3D, kind: GhostKind, focused = false): void {
  ghostDepth ??= new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.ghostDepth) meshes.push(mesh);
  });
  for (const mesh of meshes) {
    mesh.material = ghostMaterial(kind, focused);
    mesh.layers.set(0);
    mesh.renderOrder = 21;
    if (!mesh.children.some((c) => c.userData.ghostDepth)) {
      const d = new THREE.Mesh(mesh.geometry, ghostDepth);
      d.userData.ghostDepth = true;
      d.renderOrder = 20;
      d.frustumCulled = mesh.frustumCulled;
      mesh.add(d);
    }
  }
}
