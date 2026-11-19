/**
 * Shared GLSL and the global uniforms every material reads (render style v2, specs/art/STYLE.md).
 *
 * Colour pipeline: materials write LINEAR radiance into a half-float target; the frame pass
 * (frame.ts) adds bloom, the paint finish, the painter's curve and the sRGB encode.
 * Alpha is a message to the paint finish: 1 = paint me, < 0.6 = already painted (sky, far land).
 *
 * Three ways of colouring things (STYLE.md §2.3):
 *   ground  — choose one of a biome's three paints by a tone (slope to the sun, brush marks),
 *             then light it with coloured sky in the shade and sun in the open (rtGroundLight);
 *   clumps  — trees and bushes: four greens chosen by how a ball of leaves faces the light;
 *   cel     — vehicles, props, buildings: a lit tone and a sky-lit shade tone with a clean edge.
 */
import * as THREE from 'three';
import { BIOME_COUNT, paletteUniforms } from './style';
import { sharedTextures } from './textures';

const tex = sharedTextures();

/** how many openings and lamps a room can have (the starting garage's door, windows and skylights; its pendant lamps) */
export const ROOM_OPENINGS = 10;
export const ROOM_LAMPS = 10;

export const globals = {
  uCrownDay: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.75, 0.3).normalize() },
  /** key light (sun or moon), linear, ~2.7 at noon */
  uSunColor: { value: new THREE.Color(2.7, 2.55, 2.2) },
  /** light from the sky, ~0.3–0.8 by day */
  uSkyColor: { value: new THREE.Color(0.3, 0.47, 0.82) },
  /** light thrown up from the ground */
  uBounceColor: { value: new THREE.Color(0.1, 0.16, 0.05) },
  uFogColor: { value: new THREE.Color(0.4, 0.67, 0.85) },
  /** haze towards the sun */
  uFogSunColor: { value: new THREE.Color(0.66, 0.78, 0.9) },
  uFogDensity: { value: 0.00017 },
  /** render-space height the haze lies on (the ground under the camera) */
  uFogBase: { value: 0 },
  uTime: { value: 0 },
  /** world position of the render origin wrapped to the noise period: keeps ground patterns still when the origin moves */
  uOriginOffset: { value: new THREE.Vector3() },
  /** x: wetness 0..1, y: snow cover 0..1, z: precipitation 0..1, w: night 0..1 */
  uWeather: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** headlights: lamp position and direction (render space), colour × intensity (black = off) */
  uHeadPos: { value: new THREE.Vector3() },
  uHeadDir: { value: new THREE.Vector3(1, 0, 0) },
  uHeadColor: { value: new THREE.Color(0, 0, 0) },
  /** wind for vegetation: xy = direction in the xz plane, z = strength 0…1, w = gust scroll (m) */
  uWind: { value: new THREE.Vector4(1, 0, 0.15, 0) },
  /** cloud shadows drifting over the land: xy = drift (m), z = cloud cover, w = strength */
  uCloudShadow: { value: new THREE.Vector4(0, 0, 0.3, 0) },
  /** cast shadows: fine map around the vehicle, wide map around the camera */
  uShadowMap0: { value: null as THREE.Texture | null },
  uShadowMap1: { value: null as THREE.Texture | null },
  uShadowMat0: { value: new THREE.Matrix4() },
  uShadowMat1: { value: new THREE.Matrix4() },
  /** x: on/off, y: near texel (m), z: far texel (m), w: 1 / map size */
  uShadowParams: { value: new THREE.Vector4(0, 0.01, 0.1, 1 / 2048) },
  /** the paints of the country the traveller is in (for things that have no ground of their own: water) */
  uHereGround: { value: new THREE.Color(0.05, 0.25, 0.07) },
  uHereForest: { value: new THREE.Color(0.035, 0.2, 0.12) },
  /** inside a closed vehicle: what is left of the sky's light (a warm tint), and the cabin lamp (black = off) */
  uCabinAmb: { value: new THREE.Color(0.8, 0.74, 0.66) },
  uCabinLamp: { value: new THREE.Color(0, 0, 0) },
  /**
   * A room the light has to come into (the starting garage; none anywhere else — uRoomMin.w is the
   * switch). Inside its box (render space, soft edge uRoomMax.w) the sky reaches a surface only
   * through the room's openings — door, windows, skylights: parallelograms (corner A, edges U, V)
   * with the radiance of what is seen through each — the walls and floor give back uRoomAmb, and
   * up to ROOM_LAMPS lamps light what faces them (xyz, reach in w; colour × strength, and in w how
   * much of it the shade sends down — plus 2 for a lamp outside the room, over its door, which lights
   * only what is out of the room). rtCelAt / rtSkyLight / rtRoomLamps read them.
   */
  uRoomMin: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRoomMax: { value: new THREE.Vector4(0, 0, 0, 0.08) },
  uRoomAmb: { value: new THREE.Color(0, 0, 0) },
  uRoomOpenA: { value: Array.from({ length: ROOM_OPENINGS }, () => new THREE.Vector3()) },
  uRoomOpenU: { value: Array.from({ length: ROOM_OPENINGS }, () => new THREE.Vector3()) },
  uRoomOpenV: { value: Array.from({ length: ROOM_OPENINGS }, () => new THREE.Vector3()) },
  uRoomOpenL: { value: Array.from({ length: ROOM_OPENINGS }, () => new THREE.Color(0, 0, 0)) },
  uRoomLampP: { value: Array.from({ length: ROOM_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  uRoomLampC: { value: Array.from({ length: ROOM_LAMPS }, () => new THREE.Vector4(0, 0, 0, 0)) },
  tNoise: { value: tex.noise },
  tStrokes: { value: tex.strokes },
  ...paletteUniforms,
};

export type GlobalUniforms = typeof globals;

/** period (m) of all world-space procedural patterns */
export const NOISE_PERIOD = 4096;

const B = BIOME_COUNT;

export const GLSL_COMMON = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uBounceColor;
uniform vec3 uFogColor;
uniform vec3 uFogSunColor;
uniform float uFogDensity;
uniform float uFogBase;
uniform float uTime;
uniform vec3 uOriginOffset;
uniform vec4 uWeather;
uniform vec3 uHeadPos;
uniform vec3 uHeadDir;
uniform vec3 uHeadColor;
uniform vec4 uWind;
uniform vec4 uCloudShadow;
uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform vec4 uShadowParams;
uniform vec3 uCabinAmb;
uniform vec3 uCabinLamp;
uniform vec4 uRoomMin;
uniform vec4 uRoomMax;
uniform vec3 uRoomAmb;
uniform vec3 uRoomOpenA[${ROOM_OPENINGS}];
uniform vec3 uRoomOpenU[${ROOM_OPENINGS}];
uniform vec3 uRoomOpenV[${ROOM_OPENINGS}];
uniform vec3 uRoomOpenL[${ROOM_OPENINGS}];
uniform vec4 uRoomLampP[${ROOM_LAMPS}];
uniform vec4 uRoomLampC[${ROOM_LAMPS}];
uniform sampler2D tNoise;
uniform sampler2D tStrokes;
uniform vec3 uGroundPal[${B * 3}];
uniform vec3 uDryPal[${B}];
uniform vec3 uWarmPal[${B}];
uniform vec3 uCoolPal[${B}];
uniform vec3 uFarLiftPal[${B}];
uniform vec3 uForestPal[${B * 4}];
uniform vec3 uRockLitPal[${B}];
uniform vec3 uRockShadePal[${B}];
uniform vec3 uFlowerPal[${B * 3}];
uniform vec4 uBiomeMisc[${B}];
uniform vec4 uBiomeMisc2[${B}];
uniform vec3 uHereGround;
uniform vec3 uHereForest;

float rtHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec4 rtHash4(vec2 p) {
  vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}
// value noise that repeats every 'per' lattice cells
float rtNoise(vec2 p, float per) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per);
  vec2 i1 = mod(i + 1.0, per);
  float a = rtHash(i0);
  float b = rtHash(vec2(i1.x, i0.y));
  float c = rtHash(vec2(i0.x, i1.y));
  float d = rtHash(i1);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
// world-space pattern coordinates (metres), stable when the render origin moves
vec2 rtWorldXZ(vec3 renderPos) {
  return renderPos.xz + uOriginOffset.xz;
}
float rtWorldY(vec3 renderPos) {
  return renderPos.y + uOriginOffset.y;
}
// texture coordinates that repeat about every 'metres', snapped so ${NOISE_PERIOD} m holds a whole number of repeats
vec2 rtUV(vec2 w, float metres) {
  return w * (floor(${NOISE_PERIOD.toFixed(1)} / metres + 0.5) / ${NOISE_PERIOD.toFixed(1)});
}
vec4 rtNoiseAt(vec2 w, float metres) {
  return texture2D(tNoise, rtUV(w, metres));
}
float rtStrokeAt(vec2 w, float metres) {
  return texture2D(tStrokes, rtUV(w, metres)).r;
}
// smooth fbm-like noise at wavelength 'metres', 0..1
float rtFbm(vec2 w, float metres) {
  return rtNoiseAt(w, metres).r;
}

// ---------------------------------------------------------------------------------------- shadows
float rtShadowTap(sampler2D map, vec3 uvz, float bias) {
  float s = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      float d = texture2D(map, uvz.xy + vec2(float(i), float(j)) * uShadowParams.w).r;
      s += step(uvz.z - bias, d);
    }
  }
  return s / 9.0;
}
// Broad cloud shadows sliding over the land: field-sized, crossing at the wind's pace.
float rtCloudShade(vec3 pos) {
  if (uCloudShadow.w < 0.01) return 1.0;
  vec2 w = rtWorldXZ(pos) - uSunDir.xz / max(uSunDir.y, 0.2) * 400.0 + uCloudShadow.xy;
  float c = rtNoiseAt(w, 2048.0).b * 0.7 + rtNoiseAt(w + 300.0, 512.0).a * 0.3;
  float edge = mix(0.66, 0.4, uCloudShadow.z);
  return 1.0 - uCloudShadow.w * smoothstep(edge, edge + 0.08, c);
}
// 1 = lit by the key light, 0 = in cast shadow
float rtShadowMap(vec3 pos, vec3 n) {
  if (uShadowParams.x < 0.5) return 1.0;
  if (dot(n, uSunDir) <= 0.0) return 1.0;
  vec4 c0 = uShadowMat0 * vec4(pos + n * uShadowParams.y * 2.0, 1.0);
  if (all(greaterThan(c0.xyz, vec3(0.03))) && all(lessThan(c0.xyz, vec3(0.97)))) return rtShadowTap(uShadowMap0, c0.xyz, 0.0012);
  vec4 c1 = uShadowMat1 * vec4(pos + n * uShadowParams.z * 1.6, 1.0);
  if (all(greaterThan(c1.xyz, vec3(0.0))) && all(lessThan(c1.xyz, vec3(1.0)))) {
    float s = rtShadowTap(uShadowMap1, c1.xyz, 0.0009);
    vec2 e = abs(c1.xy - 0.5) * 2.0;
    return mix(s, 1.0, smoothstep(0.8, 1.0, max(e.x, e.y)));
  }
  return 1.0;
}
float rtShadow(vec3 pos, vec3 n) {
  return rtShadowMap(pos, n) * rtCloudShade(pos);
}

// ---------------------------------------------------------------------------------------- light
// How a slope stands to the sun as a painter has it: 0.5 for level ground, more where it turns to
// the light. Slopes are made 3.2 times what they are, or gentle ground shows nothing.
float rtSlopeRel(vec3 N) {
  vec3 n = normalize(vec3(N.x * 3.2, N.y, N.z * 3.2));
  vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.3), uSunDir.z));
  return clamp(0.5 + (dot(n, L) - L.y) * 1.5, 0.0, 1.0);
}
// how much of the sun reaches ground that stands so: a hollow is lit by the sky
float rtSlopeSun(float rel) {
  return mix(0.3, 1.0, smoothstep(0.04, 0.5, rel));
}
// The light on painted ground: coloured sky where it is shaded, the sun where it is open.
vec3 rtGroundLight(float open) {
  vec3 sun = mix(uSunColor, vec3(dot(uSunColor, vec3(0.333))), 0.3) * 0.42 + uSkyColor * 0.35;
  float lum = dot(uSkyColor, vec3(0.333));
  vec3 sky = mix(vec3(0.4, 0.74, 0.95), uSkyColor / max(lum, 0.01) * 0.62, 0.35) * (lum * 1.9 + 0.06);
  return mix(sky * 0.85, sun, smoothstep(0.25, 0.95, open));
}
// Cel light for things: a lit tone and a sky-lit shade tone meeting along a clean edge.
vec3 rtCel(vec3 albedo, vec3 N, float shadow) {
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-0.02, 0.08, ndl) * shadow;
  float full = smoothstep(0.42, 0.52, ndl) * shadow;
  vec3 sky = mix(uBounceColor * 2.0, uSkyColor, N.y * 0.5 + 0.5) * 0.9;
  return albedo * (sky + uSunColor * (0.3 * lit + 0.1 * full));
}
// The same cel light inside a closed vehicle: the room keeps most of the sky out and warms the rest,
// sun patches stay crisp where a window lets them in, and at night the lamp under the roof lights
// what faces it (tables and floors more than ceilings).
vec3 rtCabin(vec3 albedo, vec3 N, float shadow) {
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-0.02, 0.08, ndl) * shadow;
  float full = smoothstep(0.42, 0.52, ndl) * shadow;
  float lum = dot(uSkyColor, vec3(0.333));
  // the daylight that finds its way in has lost most of its blue
  vec3 sky = mix(uSkyColor, vec3(lum) * vec3(1.06, 1.0, 0.9), 0.55) * uCabinAmb * (0.82 + 0.18 * N.y);
  vec3 lamp = uCabinLamp * (0.62 + 0.38 * N.y);
  return albedo * (sky + uSunColor * (0.34 * lit + 0.1 * full) + lamp);
}
// ---------------------------------------------------------------------------------------- rooms
// How far into the room's box a point is: 0 outside … 1 past the soft edge (no room: 0). The box is
// drawn a little into the walls, so their inner faces are in and their outer faces out.
float rtInRoom(vec3 p) {
  if (uRoomMin.w < 0.5) return 0.0;
  vec3 a = p - uRoomMin.xyz;
  vec3 b = uRoomMax.xyz - p;
  float d = min(min(min(a.x, b.x), min(a.y, b.y)), min(a.z, b.z));
  return smoothstep(0.0, uRoomMax.w, d);
}
// One edge of a polygon of light as the shaded point sees it (both corners as unit vectors): its
// share of the vector form factor, with the usual cheap fit of theta / sin(theta).
vec3 rtEdgeFF(vec3 v1, vec3 v2) {
  float x = dot(v1, v2);
  float y = abs(x);
  float a = 0.8543985 + (0.4965155 + 0.0145206 * y) * y;
  float b = 3.4175940 + (4.1616724 + y) * y;
  float v = a / b;
  float ts = x > 0.0 ? v : 0.5 * inversesqrt(max(1.0 - x * x, 1e-7)) - v;
  return cross(v1, v2) * ts;
}
// The share of the whole sky's light a surface gets through one opening (a door, a window, a
// skylight) of even brightness: the form factor of the parallelogram A, A+U, A+U+V, A+V at p for
// the normal n, its horizon clipped by a fitted sphere integral. 0 … 1.
float rtOpeningLight(vec3 p, vec3 n, vec3 A, vec3 U, vec3 V) {
  vec3 q = p + vec3(1e-4, 2e-4, 3e-4);
  vec3 v0 = normalize(A - q);
  vec3 v1 = normalize(A + U - q);
  vec3 v2 = normalize(A + U + V - q);
  vec3 v3 = normalize(A + V - q);
  vec3 F = (rtEdgeFF(v0, v1) + rtEdgeFF(v1, v2) + rtEdgeFF(v2, v3) + rtEdgeFF(v3, v0)) * 0.15915494;
  // (whichever way it was wound: the vector points at the opening)
  if (dot(F, A + 0.5 * (U + V) - q) < 0.0) F = -F;
  float len = length(F);
  if (len < 1e-5) return 0.0;
  float z = dot(n, F) / len;
  return len * max((len * len + z) / (len + 1.0), 0.0);
}
// The sky's light inside the room: what each opening lets in, and what the room gives back.
vec3 rtRoomSky(vec3 p, vec3 n) {
  // (the floor, with the sun's patches on it, is what bounces most: undersides get a little more)
  vec3 c = uRoomAmb * (1.0 - 0.18 * n.y);
  for (int i = 0; i < ${ROOM_OPENINGS}; i++) {
    vec3 L = uRoomOpenL[i];
    if (L.r + L.g + L.b < 1e-4) continue;
    c += L * rtOpeningLight(p, n, uRoomOpenA[i], uRoomOpenU[i], uRoomOpenV[i]);
  }
  return c;
}
// The sky light of the cel shading: in the open the whole dome and the ground's bounce; in a room
// only what its openings let in.
vec3 rtSkyLight(vec3 N, vec3 pos) {
  vec3 open = mix(uBounceColor * 2.0, uSkyColor, N.y * 0.5 + 0.5) * 0.9;
  float inside = rtInRoom(pos);
  if (inside <= 0.0) return open;
  return mix(open, rtRoomSky(pos, N), inside);
}
// The room's lamps: a pool from each with a soft rim (a windowed inverse square), sent down by its
// shade; nothing outside the room — but for a lamp outside it (over the door), lighting only what is out.
vec3 rtRoomLamps(vec3 pos, vec3 N) {
  if (uRoomMin.w < 0.5) return vec3(0.0);
  vec3 sum = vec3(0.0);
  vec3 sumOut = vec3(0.0);
  for (int i = 0; i < ${ROOM_LAMPS}; i++) {
    vec4 lp = uRoomLampP[i];
    if (lp.w <= 0.0) continue;
    vec3 L = lp.xyz - pos;
    float d2 = dot(L, L);
    float r2 = lp.w * lp.w;
    if (d2 >= r2) continue;
    float d = sqrt(d2);
    L /= max(d, 1e-4);
    float win = 1.0 - d2 / r2;
    // (a pool under each lamp: bright close by, gone by its reach)
    float att = win * win / (0.35 + d2);
    // below the lamp (L points up at it) it shines in its shade's cone; above, the shade keeps it in
    float outside = step(1.5, uRoomLampC[i].w);
    float down = mix(1.0, 0.05 + 0.95 * smoothstep(0.5, 0.86, L.y), uRoomLampC[i].w - 2.0 * outside);
    float face = smoothstep(-0.2, 0.45, dot(N, L));
    vec3 c = uRoomLampC[i].rgb * att * down * face;
    // (close by, a soft knee; and a lamp indoors does not light its own shade and fittings, which glow
    // as the room's model has them)
    c /= 1.0 + max(max(max(c.r, c.g), c.b) - 0.8, 0.0);
    sum += c * (1.0 - outside) * smoothstep(0.15, 0.45, d);
    sumOut += c * outside;
  }
  float inside = rtInRoom(pos);
  return sum * inside + sumOut * (1.0 - inside);
}
// What a mirror at p inside the room sees along R (for glossy things: car paint, chrome): the light of
// an opening where the ray leaves through one (the door as a bright shape in a flank), else the room
// itself — the floor's grey, the walls' brown, the roof's dark — in the room's light, with the lamps'
// pools on it. Only meaningful where rtInRoom(p) > 0.
vec3 rtRoomMirror(vec3 p, vec3 R) {
  vec3 Rs = R + vec3(1e-5);
  vec3 tA = (uRoomMin.xyz - p) / Rs;
  vec3 tB = (uRoomMax.xyz - p) / Rs;
  vec3 tF = max(tA, tB);
  float tExit = max(min(min(tF.x, tF.y), tF.z), 0.0);
  float best = tExit + 0.3;
  vec3 through = vec3(-1.0);
  for (int i = 0; i < ${ROOM_OPENINGS}; i++) {
    vec3 L = uRoomOpenL[i];
    if (L.r + L.g + L.b < 1e-4) continue;
    vec3 A = uRoomOpenA[i];
    vec3 U = uRoomOpenU[i];
    vec3 V = uRoomOpenV[i];
    vec3 nq = cross(U, V);
    float den = dot(R, nq);
    if (abs(den) < 1e-6) continue;
    float t = dot(A - p, nq) / den;
    if (t < 0.0 || t > best) continue;
    vec3 q = p + R * t - A;
    float a = dot(q, U) / dot(U, U);
    float b = dot(q, V) / dot(V, V);
    if (a < 0.0 || a > 1.0 || b < 0.0 || b > 1.0) continue;
    best = t;
    through = L;
  }
  if (through.r >= 0.0) return through;
  vec3 hit = p + R * tExit;
  float up = smoothstep(uRoomMin.y + 0.3, uRoomMin.y + 0.5, hit.y);
  float roof = smoothstep(uRoomMax.y - 2.6, uRoomMax.y - 1.2, hit.y);
  vec3 albedo = mix(vec3(0.24, 0.235, 0.22), mix(vec3(0.33, 0.21, 0.12), vec3(0.2, 0.17, 0.15), roof), up);
  vec3 q = hit - R * 0.12;
  return albedo * (uRoomAmb * 2.2 + rtRoomLamps(q, -R) * 1.4);
}
// rtCel for a point that may be inside a room.
vec3 rtCelAt(vec3 albedo, vec3 N, float shadow, vec3 pos) {
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-0.02, 0.08, ndl) * shadow;
  float full = smoothstep(0.42, 0.52, ndl) * shadow;
  return albedo * (rtSkyLight(N, pos) + uSunColor * (0.3 * lit + 0.1 * full) + rtRoomLamps(pos, N));
}
// rtCabin for a point that may be inside a room: a vehicle standing in one gets what the room has
// (warmed by its lining) instead of the open sky.
vec3 rtCabinAt(vec3 albedo, vec3 N, float shadow, vec3 pos) {
  vec3 c = rtCabin(albedo, N, shadow);
  float inside = rtInRoom(pos);
  if (inside <= 0.0) return c;
  float ndl = dot(N, uSunDir);
  float lit = smoothstep(-0.02, 0.08, ndl) * shadow;
  float full = smoothstep(0.42, 0.52, ndl) * shadow;
  vec3 lamp = uCabinLamp * (0.62 + 0.38 * N.y);
  vec3 r = albedo * (rtRoomSky(pos, N) * uCabinAmb + uSunColor * (0.34 * lit + 0.1 * full) + lamp + rtRoomLamps(pos, N) * 0.7);
  return mix(c, r, inside);
}
// kept for older materials: same cel light, the 'ao' darkens the sky part
vec3 rtLight(vec3 albedo, vec3 n, float shadow, float ao) {
  return rtCel(albedo, n, shadow) * mix(1.0, ao, 0.5);
}
// Headlights: a warm cone with a soft spill, falling off with distance.
vec3 rtHeadlight(vec3 albedo, vec3 n, vec3 pos) {
  vec3 L = uHeadPos - pos;
  float d = length(L);
  L /= max(d, 1e-3);
  float c = dot(-L, uHeadDir);
  float cone = smoothstep(0.86, 0.975, c) + 0.16 * smoothstep(0.4, 0.9, c);
  float att = 1.0 / (1.0 + d * d / 420.0);
  float ndl = max(dot(n, L), 0.0) * 0.75 + 0.25;
  return albedo * uHeadColor * cone * att * ndl;
}

// ---------------------------------------------------------------------------------------- air
// Distance haze, thinner high up (it lies in the valleys), warmer towards the sun.
// Beyond a few kilometres the haze thickens more slowly, as it does when a painter lays in the far
// ranges: pale and blue, but still there.
vec3 rtFog(vec3 c, vec3 pos, vec3 cam) {
  vec3 d = pos - cam;
  float dist = length(d);
  float thin = mix(1.0, 0.3, smoothstep(250.0, 2400.0, pos.y - uFogBase));
  // a far range sits in the air as one pale shape: its foot no thicker in haze than its top
  // (else only the snow shows, floating)
  thin = mix(thin, 0.55, smoothstep(6000.0, 16000.0, dist));
  float dEff = dist < 2500.0 ? dist : 2500.0 + (dist - 2500.0) * 0.5;
  float f = 1.0 - exp(-dEff * uFogDensity * thin);
  // the land ends 90 km out (worldView.ts HORIZON_LAND): the air closes over it before it does
  f = max(f, smoothstep(72000.0, 88000.0, dist));
  float toSun = pow(max(dot(d / max(dist, 1e-3), uSunDir), 0.0), 6.0);
  // far ranges stand a shade deeper and bluer than the sky behind them, so they read as shapes
  vec3 air = mix(uFogColor, uFogSunColor, toSun) * mix(vec3(1.0), vec3(0.84, 0.9, 1.0), smoothstep(3000.0, 12000.0, dist) * (1.0 - smoothstep(72000.0, 88000.0, dist)));
  return mix(c, air, clamp(f, 0.0, 1.0));
}

// ---------------------------------------------------------------------------------------- paints
// A biome's three ground paints chosen by tone (0 deep shade … 1 full light).
vec3 rtGroundPaint(int b, float tone) {
  vec3 c = mix(uGroundPal[b * 3], uGroundPal[b * 3 + 1], smoothstep(0.2, 0.5, tone));
  return mix(c, uGroundPal[b * 3 + 2], smoothstep(0.56, 0.9, tone));
}
// Four greens of a wood, from the deep inside of a crown to its sunlit top.
vec3 rtForestPaint(int b, float tone) {
  vec3 c = mix(uForestPal[b * 4], uForestPal[b * 4 + 1], smoothstep(0.3, 0.42, tone));
  c = mix(c, uForestPal[b * 4 + 2], smoothstep(0.56, 0.68, tone));
  return mix(c, uForestPal[b * 4 + 3], smoothstep(0.84, 0.92, tone));
}

// legacy name kept so older shaders compile; the frame pass encodes now
vec3 rtEncode(vec3 c) {
  return c;
}
`;

/** vertex chunk: instancing + world position + log depth. Expects 'transformed' and 'objNormal'. */
export const GLSL_VERTEX_PARS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos;      // render-space position
varying vec3 vNormal;   // render-space normal
`;

export const GLSL_VERTEX_MAIN = /* glsl */ `
  mat4 rtModel = modelMatrix;
  #ifdef USE_INSTANCING
    rtModel = modelMatrix * instanceMatrix;
  #endif
  vec4 rtWorld = rtModel * vec4(transformed, 1.0);
  vPos = rtWorld.xyz;
  vNormal = normalize(mat3(rtModel) * objNormal);
  gl_Position = projectionMatrix * viewMatrix * rtWorld;
  #include <logdepthbuf_vertex>
`;

export const GLSL_FRAGMENT_PARS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
varying vec3 vPos;
varying vec3 vNormal;
`;
