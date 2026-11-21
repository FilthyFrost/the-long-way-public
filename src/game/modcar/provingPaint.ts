/**
 * The proving ground's paint (docs/MODCAR.md §28): the asphalt and the lines on it, the gravel loop with its sand, mud
 * and potholes, the concrete of the grade hill — all painted as the road and the land are (terrainMaterials.ts: tones
 * picked from three paints, brush strokes, the sky's light in the shade, the weather's wet and snow, puddles that
 * mirror the sky), the land's own paint (rtPaintedGround) round them and on their skirts, so their edges meet the
 * land without a seam. The lines are drawn from the plan position (crisp at any distance: each line's coverage of the
 * pixel, a dash's fading to its average far off); the numbers and the words on the ground from a small atlas of
 * distance fields (`glyphAtlas`).
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from '../render/shaderlib';
import { GLSL_SKY_MIRROR, skyMirrorUniforms } from '../env/sky';
import { waterUniforms } from '../render/water';
import { GROUND_PAINT, GROUND_VARYINGS } from '../render/terrainMaterials';
import { STYLE } from '../render/style';
import {
  APRON,
  BRAKE_U,
  FEATURES,
  HILL,
  KM_U,
  LANE_BACK,
  LANE_OUT,
  LOGS,
  LOOP,
  LOOP_CORRIDOR,
  OFFROAD_FINISH,
  OFFROAD_START,
  PAD,
  QUARTER_U,
  SKIDPAD,
  SLALOM,
  SLALOM_OUT,
  START_X,
  STOP_END_U,
  STRAIGHT,
  TURN,
} from '../../core/modcar/proving/layout';
import { CONE } from '../../core/modcar/proving/cones';
import { GANTRY_POST_Z, SHED, TOWER } from '../../core/modcar/proving/props';

const f = (v: number): string => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const feat = (k: string): { s0: number; s1: number } => FEATURES.find((x) => x.kind === k)!;

/** the plan, for the shaders */
const GLSL_PLAN = /* glsl */ `
  const float PG_XNEAR = ${f(STRAIGHT.xNear)};
  const float PG_XFAR = ${f(STRAIGHT.xFar)};
  const float PG_HALF = ${f(STRAIGHT.half)};
  const float PG_START_X = ${f(START_X)};
  const float PG_LANE_OUT = ${f(LANE_OUT)};
  const float PG_LANE_BACK = ${f(LANE_BACK)};
  const float PG_QUARTER = ${f(QUARTER_U)};
  const float PG_KM = ${f(KM_U)};
  const float PG_BRAKE = ${f(BRAKE_U)};
  const float PG_STOP_END = ${f(STOP_END_U)};
  const vec2 PG_TURN = vec2(${f(TURN.x)}, ${f(TURN.z)});
  const float PG_TURN_R = ${f(TURN.r)};
  const vec4 PG_PAD = vec4(${f(PAD.x0)}, ${f(PAD.z0)}, ${f(PAD.x1)}, ${f(PAD.z1)});
  const vec4 PG_APRON = vec4(${f(APRON.x0)}, ${f(APRON.z0)}, ${f(APRON.x1)}, ${f(APRON.z1)});
  const vec2 PG_SKID = vec2(${f(SKIDPAD.x)}, ${f(SKIDPAD.z)});
  const float PG_SKID_R = ${f(SKIDPAD.r)};
  const float PG_SKID_LANE = ${f(SKIDPAD.lane)};
  const float PG_SLALOM_Z = ${f(SLALOM.z)};
  const float PG_SLALOM_IN = ${f(SLALOM.gateIn)};
  const float PG_SLALOM_FIRST = ${f(SLALOM.first)};
  const float PG_SLALOM_GAP = ${f(SLALOM.gap)};
  const float PG_SLALOM_N = ${f(SLALOM.cones)};
  const float PG_SLALOM_OUT = ${f(SLALOM_OUT)};
  const float PG_GANTRY_Z = ${f(GANTRY_POST_Z)};
  const vec4 PG_SHED = vec4(${f(SHED.x0)}, ${f(SHED.z0)}, ${f(SHED.x1)}, ${f(SHED.z1)});
  const vec4 PG_TOWER = vec4(${f(TOWER.x - TOWER.half)}, ${f(TOWER.z - TOWER.half)}, ${f(TOWER.x + TOWER.half)}, ${f(TOWER.z + TOWER.half)});
  const float PG_CONE_R = ${f(CONE.r)};
  const float PG_LOOP_HALF = ${f(LOOP.half)};
  const float PG_CORRIDOR = ${f(LOOP_CORRIDOR)};
  const float PG_OFF_START = ${f(OFFROAD_START)};
  const float PG_OFF_FINISH = ${f(OFFROAD_FINISH)};
  const vec2 PG_WASH = vec2(${f(feat('washboard').s0)}, ${f(feat('washboard').s1)});
  const vec2 PG_ROCKS = vec2(${f(feat('rocks').s0)}, ${f(feat('rocks').s1)});
  const vec2 PG_LOGS = vec2(${f(feat('logs').s0)}, ${f(feat('logs').s1)});
  const vec4 PG_LOG_AT = vec4(${LOGS.at.map(f).join(', ')});
  const vec2 PG_SAND = vec2(${f(feat('sand').s0)}, ${f(feat('sand').s1)});
  const vec2 PG_MUD = vec2(${f(feat('mud').s0)}, ${f(feat('mud').s1)});
  const vec2 PG_POTS = vec2(${f(feat('potholes').s0)}, ${f(feat('potholes').s1)});
  const float PG_HILL_X0 = ${f(HILL.x0)};
  const float PG_HILL_RISE = ${f(HILL.rise)};
  const float PG_HILL_TOP = ${f(HILL.top)};
  const float PG_HILL_LANE = ${f(HILL.lane)};
  const float PG_HILL_APRON = ${f(HILL.apron)};
  const vec3 PG_RAMP_Z = vec3(${HILL.ramps.map((r) => f(r.z)).join(', ')});
  const vec3 PG_RAMP_GRADE = vec3(${HILL.ramps.map((r) => f(r.grade)).join(', ')});

  const vec3 PG_WHITE = vec3(0.86, 0.85, 0.8);
  const vec3 PG_YELLOW = vec3(0.86, 0.6, 0.09);
  const vec3 PG_RED = vec3(0.62, 0.1, 0.06);
  const vec3 PG_BLACK = vec3(0.028, 0.028, 0.034);
`;

/**
 * Lines, dashes, the paint laid over, the glyphs. Every derivative is taken once, first thing in main (gPdx, gPdy:
 * how the plan position changes across the pixel — outside any branch or loop, where derivatives are defined), and a
 * line's footprint worked out from the direction its coordinate grows in on the plan (g).
 */
const GLSL_LINES = /* glsl */ `
  uniform sampler2D tGlyphs;
  vec2 gPdx;
  vec2 gPdy;
  // how much a coordinate growing along g (per metre of the plan) changes across the pixel
  float pgFw(vec2 g) {
    return abs(dot(g, gPdx)) + abs(dot(g, gPdy)) + 1e-5;
  }
  // a line |x| < hw: its coverage of the pixel (a box filter: crisp near, the right grey far off)
  float pgLine(float x, float hw, vec2 g) {
    float fw = pgFw(g);
    return clamp((min(x + 0.5 * fw, hw) - max(x - 0.5 * fw, -hw)) / fw, 0.0, 1.0);
  }
  // inside [a, b], with a soft pixel edge
  float pgIn(float x, float a, float b, vec2 g) {
    float fw = pgFw(g);
    return clamp((min(x + 0.5 * fw, b) - max(x - 0.5 * fw, a)) / fw, 0.0, 1.0);
  }
  // a dash: on for 'on' metres of every 'period' (its start at t = 0), fading to its share far off
  float pgDash(float t, float period, float on, vec2 g) {
    float fw = pgFw(g);
    float c = mod(t, period) - on * 0.5;
    float d = pgLine(c, on * 0.5, g) + pgLine(c - period, on * 0.5, g) + pgLine(c + period, on * 0.5, g);
    return mix(clamp(d, 0.0, 1.0), on / period, smoothstep(0.2 * period, 0.8 * period, fw));
  }
  // a soft window along s: in from a, out by b
  float pgWin(float s, float a, float b, float ramp) {
    return smoothstep(a - ramp, a + ramp, s) * (1.0 - smoothstep(b - ramp, b + ramp, s));
  }
  // paint laid over paint: rgb is the paint so far (premultiplied), a how much of the pixel it covers
  void pgPut(inout vec4 acc, vec3 c, float k) {
    acc = vec4(acc.rgb * (1.0 - k) + c * k, acc.a * (1.0 - k) + k);
  }
  // one glyph of the atlas (4 × 4: the digits, %, 起, 点, 终, /), q in its box (x to the right, y up); gx, gy: how q
  // changes across the pixel
  float pgGlyph(vec2 q, float code, vec2 gx, vec2 gy) {
    if (q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) return 0.0;
    vec2 cell = vec2(mod(code, 4.0), floor(code / 4.0 + 0.001));
    float sd = textureGrad(tGlyphs, (cell + q) * 0.25, gx * 0.25, gy * 0.25).r;
    float fw = length(vec2(length(gx), length(gy))) * 6.0 + 0.004;
    return smoothstep(0.5 - fw, 0.5 + fw, sd);
  }
  // text coordinates from the plan: t = (dot(ax, P) + bx, dot(ay, P) + by); their change across the pixel
  vec2 pgTdx(vec2 ax, vec2 ay) { return vec2(dot(ax, gPdx), dot(ay, gPdx)); }
  vec2 pgTdy(vec2 ax, vec2 ay) { return vec2(dot(ax, gPdy), dot(ay, gPdy)); }
  // a number of 'digits' digits in its text box: t.x across the digits (0 … digits), t.y up (0 … 1)
  float pgNumber(vec2 t, float value, float digits, vec2 ax, vec2 ay) {
    if (t.x < 0.0 || t.x >= digits || t.y < 0.0 || t.y > 1.0) return 0.0;
    float i = floor(t.x);
    float dv = mod(floor(value / pow(10.0, digits - 1.0 - i) + 0.01), 10.0);
    return pgGlyph(vec2(fract(t.x), t.y), dv, pgTdx(ax, ay), pgTdy(ax, ay));
  }
  // a short text of codes (up to three), the same way
  float pgText(vec2 t, vec3 codes, float n, vec2 ax, vec2 ay) {
    if (t.x < 0.0 || t.x >= n || t.y < 0.0 || t.y > 1.0) return 0.0;
    float i = floor(t.x);
    float c = i < 0.5 ? codes.x : i < 1.5 ? codes.y : codes.z;
    return pgGlyph(vec2(fract(t.x), t.y), c, pgTdx(ax, ay), pgTdy(ax, ay));
  }
  // how worn a line is there (1 = whole): patches where it has flaked, more where the wheels run
  float pgWear(vec2 w, float traffic) {
    float a = rtNoiseAt(w + 91.0, 11.0).r * 0.65 + rtNoiseAt(w * 1.7 + 13.0, 2.7).g * 0.35;
    return 1.0 - 0.75 * smoothstep(0.62 - 0.22 * traffic, 0.8 - 0.2 * traffic, a);
  }
`;

/** the wet, the snow and the lamps on a hard surface (asphalt, concrete), as the road strip has them */
const GLSL_HARD_WEATHER = /* glsl */ `
  uniform float uWaterRain;
  // albedo → lit colour, with snow (ruts pressed in it where the wheels go), the wet (darker, a film of sky on it),
  // puddles in the low spots, rings where the drops land, the lamps smeared in the wet
  vec3 pgHardLit(vec3 albedo, vec3 n, float sh, float tone, float track, float hard, vec2 lowAt, float dist, out float wetOut) {
    vec2 w = rtWorldXZ(vPos);
    float snowCover = uWeather.y * mix(1.0, 0.6, hard);
    float snow = snowCover * smoothstep(0.55, 0.85, n.y + (rtFbm(w, 16.0) - 0.5) * 0.25);
    float ruts = track * smoothstep(0.3, 0.6, uWeather.y) * hard;
    snow *= 1.0 - 0.75 * ruts;
    albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0));
    albedo *= 1.0 - 0.3 * ruts * uWeather.y;
    float wetness = uWeather.x * (1.0 - clamp(snow, 0.0, 1.0));
    albedo *= 1.0 - mix(0.22, 0.44, hard) * wetness;
    vec3 col = albedo * rtGroundLight(rtSlopeSun(rtSlopeRel(n)) * sh);
    vec3 v = normalize(cameraPosition - vPos);
    float wet = wetness * hard;
    wetOut = wet;
    float lowSpot = rtNoiseAt(lowAt * 0.55 + 17.0, 11.0).r * 0.62 + rtNoiseAt(w + 51.0, 31.0).g * 0.38 + track * 0.14;
    float fill = smoothstep(0.35, 1.0, uWeather.x);
    float pe = 0.87 - 0.2 * fill;
    float puddle = smoothstep(pe, pe + 0.035, lowSpot + (rtFbm(w, 2.0) - 0.5) * 0.05) * step(0.02, fill) * wet * step(0.9, n.y);
    float nv = max(dot(n, v), 0.0);
    float fres = 0.03 + 0.97 * pow(1.0 - nv, 5.0);
    vec3 up = normalize(mix(n, vec3(0.0, 1.0, 0.0), puddle));
    vec3 rd = reflect(-v, up);
    float ringAmt = 0.0;
    if (uWaterRain > 0.02 && puddle > 0.01 && dist < 70.0) {
      vec2 cell = floor(w / 0.22);
      vec2 fq = fract(w / 0.22) - 0.5;
      float hsh = rtHash(cell + 3.3);
      float ph = fract(uTime * (1.1 + hsh) + hsh * 7.0);
      ringAmt = (1.0 - smoothstep(0.04, 0.1, abs(length(fq - (vec2(rtHash(cell), rtHash(cell + 9.1)) - 0.5) * 0.4) - ph * 0.4))) * (1.0 - ph) * step(hsh, uWaterRain * 0.45) * (1.0 - smoothstep(18.0, 45.0, dist));
    }
    rd = normalize(rd + vec3(0.0, 0.25 * ringAmt, 0.0));
    vec3 skyR = rtSkyMirror(rd);
    vec3 hv = normalize(v + uSunDir);
    float glint = pow(max(dot(up, hv), 0.0), mix(40.0, 600.0, puddle)) * sh;
    col = mix(col, skyR * 0.85, wet * fres * 0.3);
    col = mix(col, skyR * 0.92, puddle * (0.3 + 0.7 * smoothstep(0.0, 0.6, fres)));
    col += uSunColor * glint * wet * mix(0.5, 2.5, puddle) * uSunVis;
    col += ringAmt * puddle * skyR * 0.5;
    col += rtHeadlight(albedo, n, vPos) * (1.0 + 0.6 * wet);
    if (wet > 0.01 && uHeadColor.r + uHeadColor.g + uHeadColor.b > 0.01) {
      vec3 rf = reflect(-v, vec3(0.0, 1.0, 0.0));
      vec3 aside = normalize(cross(uHeadDir, vec3(0.0, 1.0, 0.0)));
      vec3 across = normalize(cross(v, vec3(0.0, 1.0, 0.0)));
      float smear = 0.0;
      for (int k = 0; k < 2; k++) {
        vec3 L = uHeadPos + aside * (k == 0 ? -0.55 : 0.55) - vPos;
        float dl = length(L);
        L /= max(dl, 1e-3);
        vec3 dd = rf - L;
        float sa = dot(dd, across);
        float sb = length(dd - across * sa);
        smear += exp(-sa * sa * 2500.0) * exp(-sb * sb * 22.0) * smoothstep(0.5, 0.95, dot(-L, uHeadDir)) / (1.0 + dl * dl * 0.004);
      }
      float rip = 0.55 + 0.45 * rtNoiseAt(lowAt * vec2(3.0, 0.35) + uTime * 0.05, 2.0).r;
      col += uHeadColor * smear * wet * mix(0.5, 1.0, puddle) * 0.55 * rip;
    }
    return col;
  }
`;

const VERTEX_HEAD = /* glsl */ `
  ${GLSL_VERTEX_PARS}
  ${GROUND_VARYINGS}
  attribute vec4 aBiomeW;
  attribute vec4 aGround;
`;

const VERTEX_TAIL = /* glsl */ `
  vPos = rtWorld.xyz;
  vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * rtWorld;
  #include <logdepthbuf_vertex>
`;

/**
 * In place of three's logdepthbuf_fragment: the depth pulled a little towards the eye where the land lies close under
 * the drawn ground (its edges, its skirts: 'edge' 1) and, as the road strip's, further off where the land's mesh is
 * coarser, so the land never shows through; not over the drawn ground's middle, where the land is let down a hand
 * under it and what stands on it (a rock, a log, a cone) must not be drawn under it.
 */
const GLSL_DEPTH = /* glsl */ `
  void pgDepth(float edge) {
    #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
    float d = length(vPos - cameraPosition);
    float k = 1.0 - (0.0012 * edge + 0.02 * smoothstep(120.0, 1500.0, d));
    gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2(vFragDepth * k) * logDepthBufFC * 0.5;
    #elif defined( USE_REVERSED_DEPTH_BUFFER )
    // (the same pull toward the eye: a reversed depth is near / distance, so a distance k times as far is depth / k)
    float d = length(vPos - cameraPosition);
    float k = 1.0 - (0.0012 * edge + 0.02 * smoothstep(120.0, 1500.0, d));
    gl_FragDepth = gl_FragCoord.z / k;
    #endif
  }
`;

const v3 = (c: [number, number, number]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);

function hardUniforms(glyphs: THREE.Texture): Record<string, THREE.IUniform> {
  const R = STYLE.road;
  return {
    ...globals,
    ...skyMirrorUniforms(),
    ...waterUniforms,
    uAsphaltLit: { value: v3(R.asphalt.lit) },
    uAsphaltMid: { value: v3(R.asphalt.mid) },
    uAsphaltDeep: { value: v3(R.asphalt.deep) },
    uPatch: { value: v3(R.patch) },
    uGravel: { value: v3(R.gravel) },
    tGlyphs: { value: glyphs },
  };
}

const FRAG_HEAD = /* glsl */ `
  ${GLSL_FRAGMENT_PARS}
  ${GLSL_COMMON}
  ${GROUND_VARYINGS}
  ${GROUND_PAINT}
  ${GLSL_SKY_MIRROR}
  uniform vec3 uAsphaltLit;
  uniform vec3 uAsphaltMid;
  uniform vec3 uAsphaltDeep;
  uniform vec3 uPatch;
  uniform vec3 uGravel;
  ${GLSL_PLAN}
  ${GLSL_LINES}
  ${GLSL_HARD_WEATHER}
  ${GLSL_DEPTH}
`;

// ------------------------------------------------------------------ the asphalt

const X = 'vec2(1.0, 0.0)';
const Z = 'vec2(0.0, 1.0)';

const GLSL_ASPHALT = /* glsl */ `
  float pgAsphalt(vec2 p) {
    float s = min(min(p.x - PG_XFAR, PG_XNEAR - p.x), min(p.y + PG_HALF, PG_HALF - p.y));
    s = max(s, PG_TURN_R - length(p - PG_TURN));
    s = max(s, min(min(p.x - PG_PAD.x, PG_PAD.z - p.x), min(p.y - PG_PAD.y, PG_HALF - p.y)));
    s = max(s, min(min(p.x - PG_APRON.x, PG_APRON.z - p.x), min(p.y - PG_APRON.y, PG_APRON.w - p.y)));
    return s;
  }
  // a painted dot where a cone stands: a ring with a paler middle
  float pgDot(vec2 p, vec2 c) {
    vec2 d = p - c;
    float r = length(d);
    vec2 g = d / max(r, 1e-4);
    return pgLine(r, PG_CONE_R * 1.05, g) * (1.0 - 0.55 * (1.0 - smoothstep(PG_CONE_R * 0.45, PG_CONE_R * 0.6, r)));
  }
  // the outline of a box (lo … hi) in plan-aligned coordinates, its lines hw wide
  float pgBoxLine(vec2 p, vec2 lo, vec2 hi, float hw) {
    float inX = pgIn(p.x, lo.x - hw, hi.x + hw, ${X});
    float inY = pgIn(p.y, lo.y - hw, hi.y + hw, ${Z});
    float sides = max(pgLine(p.x - lo.x, hw, ${X}), pgLine(p.x - hi.x, hw, ${X})) * inY;
    float ends = max(pgLine(p.y - lo.y, hw, ${Z}), pgLine(p.y - hi.y, hw, ${Z})) * inX;
    return max(sides, ends);
  }
  // yellow and black stripes across a box: a keep-clear (lo … hi); 'yellow' says which stripe
  float pgHatch(vec2 p, vec2 lo, vec2 hi, out float yellow) {
    float k = pgIn(p.x, lo.x, hi.x, ${X}) * pgIn(p.y, lo.y, hi.y, ${Z});
    float t = (p.x + p.y) / 0.7;
    float fw = pgFw(vec2(1.0, 1.0) / 0.7);
    yellow = mix(smoothstep(0.5 - fw, 0.5 + fw, abs(fract(t) - 0.5) * 2.0), 0.5, smoothstep(0.3, 0.8, fw));
    return k;
  }

  // the rubber the tyres have left: in the lanes, at the start, after the brake line, round the skid pad, through the slalom
  float pgRubber(vec2 P, float u, vec2 w) {
    float rub = 0.0;
    float streak = rtNoiseAt(vec2(P.x * 0.05, P.y * 3.0) + 7.0, 9.0).r;
    if (abs(P.y) < PG_HALF && P.x > PG_XFAR - 40.0) {
      float tOut = abs(abs(P.y - PG_LANE_OUT) - 0.78);
      float tBack = abs(abs(P.y - PG_LANE_BACK) - 0.78);
      float lanes = exp(-pow(tOut / 0.26, 2.0)) + exp(-pow(tBack / 0.26, 2.0));
      rub += 0.14 * lanes * (0.7 + 0.6 * rtNoiseAt(w + 31.0, 23.0).g);
      // the launches: two black streaks from the start box, thinning out
      float launch = smoothstep(-3.6, -2.6, u) * (1.0 - smoothstep(0.0, 26.0 + 14.0 * streak, u));
      rub += 0.62 * launch * exp(-pow(tOut / (0.11 + 0.05 * streak), 2.0));
      // the brake line: long dark marks into the stopping zone, a few pairs a little apart
      float skid = smoothstep(PG_BRAKE - 1.0, PG_BRAKE + 2.0, u) * (1.0 - smoothstep(PG_BRAKE + 14.0, PG_BRAKE + 34.0 + 18.0 * streak, u));
      float pair = exp(-pow(tOut / 0.12, 2.0)) + 0.7 * exp(-pow(abs(abs(P.y - PG_LANE_OUT - 0.25) - 0.8) / 0.1, 2.0)) * step(0.45, streak);
      rub += 0.55 * skid * pair;
    }
    // the skid pad's lane, worn round and round
    vec2 ds = P - PG_SKID;
    float rr = length(ds);
    if (abs(rr - PG_SKID_R) < 3.0) {
      float ring = 1.0 - smoothstep(0.5, 1.5, abs(rr - PG_SKID_R));
      float ang = atan(ds.y, ds.x);
      float streaks = rtNoiseAt(vec2(ang * 30.0, rr * 2.5), 64.0).r;
      rub += 0.42 * ring * (0.45 + 0.8 * streaks);
    }
    // the slalom: the line weaving between the cones
    if (abs(P.y - PG_SLALOM_Z) < 4.0 && P.x < PG_SLALOM_IN + 6.0 && P.x > PG_SLALOM_OUT - 6.0) {
      float zc = PG_SLALOM_Z + 2.3 * cos(3.14159265 * (P.x - PG_SLALOM_FIRST) / PG_SLALOM_GAP);
      float tr2 = abs(abs(P.y - zc) - 0.78);
      rub += 0.32 * exp(-pow(tr2 / 0.16, 2.0)) * (0.5 + 0.7 * streak);
    }
    return clamp(rub, 0.0, 0.85);
  }

  // every line, box, number and word painted on the asphalt: (paint, coverage)
  vec4 pgMarkings(vec2 P, float u, vec2 w) {
    vec4 acc = vec4(0.0);
    float az = abs(P.y);
    // (where the straight's edges meet the turning circle's)
    float edgeEnd = PG_TURN.x + sqrt((PG_TURN_R - 0.5) * (PG_TURN_R - 0.5) - (PG_HALF - 0.5) * (PG_HALF - 0.5));
    if (az < PG_HALF + 0.5 && P.x < PG_XNEAR + 0.5 && P.x > edgeEnd - 0.5) {
      float traffic = exp(-pow((abs(P.y - (P.y < 0.0 ? PG_LANE_OUT : PG_LANE_BACK)) - 0.78) / 0.35, 2.0));
      float wear = pgWear(w, traffic);
      // the edges, broken where the pad joins
      float e = pgLine(az - (PG_HALF - 0.5), 0.075, ${Z}) * step(edgeEnd, P.x);
      if (P.y < 0.0 && P.x > PG_PAD.x + 1.0 && P.x < PG_PAD.z - 1.0) e *= pgDash(P.x, 6.0, 3.0, ${X});
      pgPut(acc, PG_WHITE, e * wear);
      // the middle: dashed
      pgPut(acc, PG_WHITE, pgLine(P.y, 0.06, ${Z}) * pgDash(u + 28.0, 9.0, 3.0, ${X}) * step(-28.0, u) * step(edgeEnd + 3.0, P.x) * wear);
      float inLanes = step(az, PG_HALF - 0.5);
      // the start line, and the box a vehicle stands in behind it
      pgPut(acc, PG_WHITE, pgLine(u, 0.2, ${X}) * inLanes * wear);
      pgPut(acc, PG_WHITE, pgBoxLine(vec2(u, P.y), vec2(-6.6, PG_LANE_OUT - 1.9), vec2(-0.6, PG_LANE_OUT + 1.9), 0.06) * wear);
      // 起点, read coming up to it: up the straight (−x), its right to −z
      {
        vec2 ax = vec2(0.0, -1.0 / 1.6);
        vec2 ay = vec2(-1.0 / 3.6, 0.0);
        vec2 t = vec2((PG_LANE_OUT + 1.6 - P.y) / 1.6, (u + 12.6) / 3.6);
        pgPut(acc, PG_WHITE, pgText(t, vec3(11.0, 12.0, 15.0), 2.0, ax, ay) * wear);
      }
      // a tick at every hundred metres at both edges, and the hundreds painted by the far edge of the out lane
      if (u > 50.0 && u < PG_BRAKE - 60.0) {
        float k = floor(u / 100.0 + 0.5);
        float du = u - k * 100.0;
        pgPut(acc, PG_WHITE, pgLine(du, 0.1, ${X}) * step(PG_HALF - 2.1, az) * step(az, PG_HALF - 0.5) * wear);
        vec2 ax = vec2(0.0, -1.0 / 0.62);
        vec2 ay = vec2(-1.0 / 1.8, 0.0);
        vec2 t = vec2((PG_LANE_OUT - 1.4 - P.y) / 0.62, (du - 1.0) / 1.8);
        float digits = k >= 10.0 ? 4.0 : 3.0;
        pgPut(acc, PG_WHITE, pgNumber(t, k * 100.0, digits, ax, ay) * wear * 0.92);
      }
      // the quarter mile: yellow; the kilometre: chequered
      pgPut(acc, PG_YELLOW, pgLine(u - PG_QUARTER, 0.3, ${X}) * inLanes * wear);
      {
        float band = pgIn(u, PG_KM - 1.0, PG_KM + 1.0, ${X}) * inLanes;
        vec2 q = vec2(u - PG_KM, P.y) / 0.5;
        float fw = max(pgFw(vec2(2.0, 0.0)), pgFw(vec2(0.0, 2.0)));
        float chk = mod(floor(q.x) + floor(q.y), 2.0);
        vec3 c = mix(PG_BLACK, PG_WHITE, mix(chk, 0.5, smoothstep(0.4, 1.0, fw)));
        pgPut(acc, c, band * wear);
      }
      // the brake line: red and white blocks; the stopping zone: a stripe every five metres, its metres every ten
      {
        float band = pgIn(u, PG_BRAKE - 0.5, PG_BRAKE + 0.5, ${X}) * inLanes;
        float q = (P.y + PG_HALF) / 1.0;
        float fw = pgFw(${Z});
        float red = mix(step(1.0, mod(floor(q), 2.0)), 0.5, smoothstep(0.4, 1.0, fw));
        pgPut(acc, mix(PG_WHITE, PG_RED, red), band * wear);
        float zone = step(PG_BRAKE + 2.0, u) * step(u, PG_STOP_END + 0.5);
        float du = u - PG_BRAKE;
        float stripe = pgLine(mod(du + 2.5, 5.0) - 2.5, 0.06, ${X}) * zone * inLanes;
        pgPut(acc, PG_WHITE, stripe * wear * 0.9);
        pgPut(acc, PG_WHITE, pgLine(u - PG_STOP_END, 0.25, ${X}) * inLanes * wear);
        if (du > 5.0 && du < PG_STOP_END - PG_BRAKE + 1.0) {
          float k = floor(du / 10.0 + 0.5);
          float d10 = du - k * 10.0;
          float digits = k >= 10.0 ? 3.0 : 2.0;
          vec2 ax = vec2(0.0, -1.0 / 0.72);
          vec2 ay = vec2(-1.0 / 1.7, 0.0);
          vec2 t = vec2((PG_LANE_OUT + 0.36 * digits - P.y) / 0.72, (d10 - 0.6) / 1.7);
          pgPut(acc, PG_WHITE, pgNumber(t, k * 10.0, digits, ax, ay) * wear);
        }
      }
      // where the cones stand at the ends of the lines
      float zc = PG_HALF - 0.4;
      float dots = max(pgDot(P, vec2(PG_START_X, zc)), pgDot(P, vec2(PG_START_X, -zc)));
      dots = max(dots, max(pgDot(P, vec2(PG_START_X - PG_BRAKE, zc)), pgDot(P, vec2(PG_START_X - PG_BRAKE, -zc))));
      dots = max(dots, max(pgDot(P, vec2(PG_START_X - PG_STOP_END, zc)), pgDot(P, vec2(PG_START_X - PG_STOP_END, -zc))));
      pgPut(acc, PG_YELLOW, dots * wear);
    }
    // the turning circle's edge
    {
      vec2 dt = P - PG_TURN;
      float rr = length(dt);
      if (abs(rr - (PG_TURN_R - 0.5)) < 1.0 && (P.x < edgeEnd || az > PG_HALF - 0.5)) pgPut(acc, PG_WHITE, pgLine(rr - (PG_TURN_R - 0.5), 0.075, dt / max(rr, 1e-4)) * pgWear(w, 0.0));
    }
    // the pad: its edges, the skid pad, the slalom, the keep-clear round the gantry's post
    if (P.x > PG_PAD.x - 1.0 && P.x < PG_PAD.z + 1.0 && P.y > PG_PAD.y - 1.0 && P.y < -PG_HALF + 1.0) {
      float wear = pgWear(w, 0.0);
      float e = pgLine(P.x - (PG_PAD.x + 0.5), 0.075, ${X}) * step(P.y, -PG_HALF) * step(PG_PAD.y + 0.5, P.y);
      e = max(e, pgLine(P.y - (PG_PAD.y + 0.5), 0.075, ${Z}) * step(PG_PAD.x + 0.5, P.x) * step(P.x, PG_PAD.z - 0.5));
      e = max(e, pgLine(P.x - (PG_PAD.z - 0.5), 0.075, ${X}) * step(P.y, PG_APRON.y) * step(PG_PAD.y + 0.5, P.y));
      pgPut(acc, PG_WHITE, e * wear);
      vec2 ds = P - PG_SKID;
      float rr = length(ds);
      if (rr < PG_SKID_R + PG_SKID_LANE + 1.0) {
        vec2 gr = ds / max(rr, 1e-4);
        pgPut(acc, PG_WHITE, max(pgLine(rr - (PG_SKID_R - PG_SKID_LANE), 0.075, gr), pgLine(rr - (PG_SKID_R + PG_SKID_LANE), 0.075, gr)) * wear);
        // the start: across the lane where a vehicle is set down, at the circle's +z
        pgPut(acc, PG_WHITE, pgLine(ds.x, 0.12, ${X}) * pgIn(ds.y, PG_SKID_R - PG_SKID_LANE, PG_SKID_R + PG_SKID_LANE, ${Z}) * wear);
        // the cones round its inside, every fifteen degrees
        float ri = PG_SKID_R - PG_SKID_LANE - 0.5;
        float a = atan(ds.y, ds.x);
        float step15 = 3.14159265 / 12.0;
        float ak = floor(a / step15 + 0.5) * step15;
        pgPut(acc, PG_YELLOW, pgDot(P, PG_SKID + ri * vec2(cos(ak), sin(ak))) * wear);
        // its middle: a ring
        pgPut(acc, PG_WHITE, pgLine(rr - 2.4, 0.06, gr) * wear);
      }
      float dzs = P.y - PG_SLALOM_Z;
      if (abs(dzs) < 5.0 && P.x < PG_SLALOM_IN + 25.0 && P.x > PG_SLALOM_OUT - 25.0) {
        float lane = step(P.x, PG_SLALOM_IN + 20.0) * step(PG_SLALOM_OUT - 22.0, P.x);
        pgPut(acc, PG_WHITE, pgLine(abs(dzs) - 4.0, 0.06, ${Z}) * pgDash(P.x, 4.0, 2.0, ${X}) * lane * wear);
        float gates = max(pgLine(P.x - PG_SLALOM_IN, 0.15, ${X}), pgLine(P.x - PG_SLALOM_OUT, 0.15, ${X})) * step(abs(dzs), 4.0);
        pgPut(acc, PG_WHITE, gates * wear);
        // where each cone stands, and the gates' cones
        float k = clamp(floor((PG_SLALOM_FIRST - P.x) / PG_SLALOM_GAP + 0.5), 0.0, PG_SLALOM_N - 1.0);
        float cone = pgDot(P, vec2(PG_SLALOM_FIRST - k * PG_SLALOM_GAP, PG_SLALOM_Z));
        cone = max(cone, max(pgDot(P, vec2(PG_SLALOM_IN, PG_SLALOM_Z + 4.0)), pgDot(P, vec2(PG_SLALOM_IN, PG_SLALOM_Z - 4.0))));
        cone = max(cone, max(pgDot(P, vec2(PG_SLALOM_OUT, PG_SLALOM_Z + 4.0)), pgDot(P, vec2(PG_SLALOM_OUT, PG_SLALOM_Z - 4.0))));
        pgPut(acc, PG_YELLOW, cone * wear);
      }
      // the gantry's post on the pad's edge: keep clear
      float yl;
      float hk = pgHatch(P, vec2(PG_START_X - 1.4, PG_GANTRY_Z - 1.4), vec2(PG_START_X + 1.4, -PG_HALF - 0.4), yl);
      pgPut(acc, mix(PG_BLACK, PG_YELLOW, yl), hk * wear * 0.9);
    }
    // the apron: bays before the shed, a keep-clear round the tower's foot
    if (P.x > PG_APRON.x - 1.0 && P.y > PG_APRON.y - 1.0 && P.y < PG_APRON.w + 1.0) {
      float wear = pgWear(w, 0.0);
      float bx0 = PG_SHED.x - 7.0;
      float inBay = pgIn(P.x, bx0, PG_SHED.x - 1.5, ${X});
      float bays = 0.0;
      bays = max(bays, pgLine(P.y - (PG_SHED.y - 1.5), 0.06, ${Z}));
      bays = max(bays, pgLine(P.y - (PG_SHED.y + 1.7), 0.06, ${Z}));
      bays = max(bays, pgLine(P.y - (PG_SHED.y + 4.9), 0.06, ${Z}));
      bays = max(bays, pgLine(P.y - (PG_SHED.y + 8.1), 0.06, ${Z}));
      bays = max(bays, pgLine(P.y - (PG_SHED.y + 11.3), 0.06, ${Z}));
      bays *= inBay;
      bays = max(bays, pgLine(P.x - bx0, 0.06, ${X}) * pgIn(P.y, PG_SHED.y - 1.56, PG_SHED.y + 11.36, ${Z}));
      pgPut(acc, PG_WHITE, bays * wear);
      float yl;
      float hk = pgHatch(P, PG_TOWER.xy - 1.6, PG_TOWER.zw + 1.6, yl) * (1.0 - pgIn(P.x, PG_TOWER.x - 0.05, PG_TOWER.z + 0.05, ${X}) * pgIn(P.y, PG_TOWER.y - 0.05, PG_TOWER.w + 0.05, ${Z}));
      pgPut(acc, mix(PG_BLACK, PG_YELLOW, yl), hk * wear * 0.85);
    }
    return acc;
  }
`;

/** the asphalt sheet: the straight, the turning circle, the pad, the apron; their lines; the land on the skirt */
export function asphaltMaterial(glyphs: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: hardUniforms(glyphs),
    vertexShader: /* glsl */ `
      ${VERTEX_HEAD}
      attribute vec2 aPlan;
      varying vec2 vPlan;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vPlan = aPlan;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        ${VERTEX_TAIL}
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      varying vec2 vPlan;
      ${GLSL_ASPHALT}
      void main() {
        pgDepth(1.0 - smoothstep(1.0, 2.5, pgAsphalt(vPlan)));
        gPdx = dFdx(vPlan);
        gPdy = dFdy(vPlan);
        vec3 n = vec3(0.0, 1.0, 0.0);
        vec2 P = vPlan;
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        float sh = rtShadow(vPos, n);
        vec3 groundAlb;
        vec3 ground = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, sh, groundAlb);
        float farA = mix(1.0, 0.5, smoothstep(900.0, 1400.0, dist));
        float ins = pgAsphalt(P);
        float aa = max(fwidth(ins), 1e-4);
        float cn = rtNoiseAt(w + 17.0, 24.0).r;
        float cw = max(fwidth(cn), 1e-4);
        if (ins < -1.4) {
          gl_FragColor = vec4(rtFog(ground, vPos, cameraPosition), farA);
          return;
        }
        float near = 1.0 - smoothstep(25.0, 90.0, dist);
        float u = PG_START_X - P.x;
        // ---- the asphalt, painted by tone: long strokes laid along the straight, warm and cool patches
        float brush = (texture2D(tStrokes, vec2(P.y / 2.5, P.x / 6.0)).r - 0.5) * 0.22 * (1.0 - smoothstep(20.0, 60.0, dist))
                    + (texture2D(tStrokes, vec2(P.y / 9.0 + 0.37, P.x / 34.0)).r - 0.5) * 0.18;
        // (newer than the road's, darker: in the sun mostly its middle grey, the warm grey only where the brush lifts it)
        float tone = 0.38 + brush + (rtFbm(w, 64.0) - 0.5) * 0.18 + 0.34 * sh - (1.0 - sh) * 0.3;
        vec3 asphalt = mix(uAsphaltDeep, uAsphaltMid, smoothstep(0.12, 0.42, tone));
        asphalt = mix(asphalt, uAsphaltLit * vec3(0.9, 0.93, 1.0), smoothstep(0.6, 0.98, tone));
        float aw = smoothstep(0.44, 0.6, rtNoiseAt(w + 211.0, 70.0).g);
        float ac = smoothstep(0.6, 0.72, rtNoiseAt(w * vec2(1.0, 0.6) + 97.0, 45.0).b) * 0.7;
        asphalt *= mix(vec3(1.0), vec3(1.12, 1.03, 0.88), aw * 0.7);
        asphalt *= mix(vec3(1.0), vec3(0.9, 0.96, 1.1), ac * (0.8 - 0.5 * aw));
        // a newer surface than the road's: a few patches, cracks sealed with tar, the stone of it near the eye
        float rep = rtNoiseAt(w + 151.0, 26.0).a + (rtNoiseAt(w + 9.0, 5.0).r - 0.5) * 0.2;
        asphalt = mix(asphalt, uPatch * 1.7, smoothstep(0.74, 0.78, rep) * 0.28);
        float crack = (1.0 - smoothstep(cw * 0.5, cw * 1.3 + 0.001, abs(cn - 0.5))) * smoothstep(0.7, 0.76, rtNoiseAt(w + 3.0, 160.0).g) * (1.0 - smoothstep(20.0, 45.0, dist));
        asphalt = mix(asphalt, vec3(0.05, 0.05, 0.06), crack * 0.38);
        asphalt *= 1.0 + (rtNoiseAt(w, 0.4).r - 0.5) * 0.3 * (1.0 - smoothstep(4.0, 14.0, dist));
        // ---- rubber, then the paint over it
        float rub = pgRubber(P, u, w);
        asphalt = mix(asphalt, vec3(0.035, 0.034, 0.04), rub);
        vec4 mk = pgMarkings(P, u, w);
        asphalt = asphalt * (1.0 - mk.a) + mk.rgb * mix(1.0, 0.82, rub);
        // ---- its edge: crisp, a few centimetres of crumble, a hand of grit, then the land
        float rag = (rtNoiseAt(w * 7.0, 3.0).r - 0.5) * 0.05 * near;
        float paved = smoothstep(-aa, aa, ins + rag);
        float grit = 1.0 - smoothstep(0.2, 0.55, -ins + (rtNoiseAt(w + 7.7, 1.7).g - 0.5) * 0.35);
        vec3 gritAlb = mix(uGravel * mix(0.62, 1.05, smoothstep(0.25, 0.75, tone)), groundAlb, 0.35);
        gritAlb *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, 0.08, -ins));
        vec3 albedo = mix(gritAlb, asphalt, paved);
        float track = 0.0;
        if (abs(P.y) < PG_HALF) track = exp(-pow((abs(abs(P.y - (P.y < 0.0 ? PG_LANE_OUT : PG_LANE_BACK)) - 0.78)) / 0.3, 2.0));
        float wetOut;
        vec3 col = pgHardLit(albedo, n, sh, tone, track, paved, P, dist, wetOut);
        col = mix(ground, col, max(paved, grit));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, farA);
      }`,
  });
}

// ------------------------------------------------------------------ the loop

/** the gravel loop: crushed stone with the wheels' tracks in it, the sand, the mud, the potholes, the lines; the land's shoulders */
export function loopMaterial(glyphs: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: hardUniforms(glyphs),
    vertexShader: /* glsl */ `
      ${VERTEX_HEAD}
      attribute vec4 aLoop;
      varying vec4 vLoop;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vLoop = aLoop;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        ${VERTEX_TAIL}
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      varying vec4 vLoop;
      void main() {
        pgDepth(smoothstep(4.6, 5.8, abs(vLoop.y)));
        // (the plan here is the loop's: s along it, d across)
        gPdx = dFdx(vLoop.xy);
        gPdy = dFdy(vLoop.xy);
        float s = vLoop.x;
        float d = vLoop.y;
        float ad = abs(d);
        float lump = vLoop.z;
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        // (the washboard's ripples go flat further off: so fine, they would shimmer)
        float washW = pgWin(s, PG_WASH.x, PG_WASH.y, 1.5) * (1.0 - smoothstep(4.0, 7.0, ad));
        vec3 n = normalize(mix(normalize(vNormal), vec3(0.0, 1.0, 0.0), washW * smoothstep(14.0, 40.0, dist)));
        float sh = rtShadow(vPos, n);
        vec3 groundAlb;
        vec3 ground = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, sh, groundAlb);
        float farA = mix(1.0, 0.5, smoothstep(900.0, 1400.0, dist));
        float rfw = pgFw(vec2(0.92, 0.38) / 0.22);
        if (ad > PG_CORRIDOR + 0.6) {
          gl_FragColor = vec4(rtFog(ground, vPos, cameraPosition), farA);
          return;
        }
        float near = 1.0 - smoothstep(20.0, 70.0, dist);
        float rel = rtSlopeRel(n);
        RtPal pal = rtPal(vBiomeW);
        // ---- crushed stone: packed in two tracks where the wheels run, loose between them and along the edges
        float st = rtStrokeAt(w, 3.0) - 0.5;
        float tone = rel + st * 0.3 * near + (rtFbm(w, 30.0) - 0.5) * 0.24 + 0.3 * sh - (1.0 - sh) * 0.3;
        float tracks = exp(-pow((ad - 0.8) / 0.34, 2.0));
        vec3 gDeep = vec3(0.14, 0.15, 0.2);
        vec3 gMid = vec3(0.33, 0.31, 0.28);
        vec3 gLit = vec3(0.5, 0.47, 0.41);
        vec3 gravel = mix(gDeep, gMid, smoothstep(0.12, 0.42, tone));
        gravel = mix(gravel, gLit, smoothstep(0.55, 0.88, tone));
        gravel *= mix(1.0, 0.84, tracks);
        // stones: light and dark dabs of the brush, at two sizes and turned off the grid, fewer in the tracks; a loose
        // berm along each edge
        vec2 wr = mat2(0.8, -0.6, 0.6, 0.8) * w;
        float pb = rtStrokeAt(wr * 1.7 + 3.1, 1.6) * 0.6 + rtStrokeAt(w * 2.3 + 7.7, 1.1) * 0.4;
        float pd = rtStrokeAt(wr.yx * 2.9 + 1.3, 1.3);
        float stones = near * (1.0 - 0.7 * tracks);
        gravel = mix(gravel, gLit * 1.18, smoothstep(0.56, 0.64, pb) * 0.55 * stones);
        gravel = mix(gravel, gDeep * 1.25, smoothstep(0.6, 0.68, pd) * 0.5 * stones);
        // (and the grain of it, close by)
        float grain = rtNoiseAt(wr * 3.0, 0.9).g - 0.5;
        gravel *= 1.0 + grain * 0.35 * (1.0 - smoothstep(3.0, 12.0, dist));
        float berm = exp(-pow((ad - (PG_LOOP_HALF - 0.4)) / 0.45, 2.0));
        gravel *= 1.0 + 0.1 * berm;
        // the gravel round the logs scuffed dark by the wheels that climbed them
        float scuff = 0.0;
        if (s > PG_LOGS.x - 2.0 && s < PG_LOGS.y + 2.0) {
          vec4 dl = abs(vec4(s) - PG_LOG_AT);
          float dm = min(min(dl.x, dl.y), min(dl.z, dl.w));
          scuff = (1.0 - smoothstep(0.3, 1.4 + 0.6 * rtNoiseAt(w, 4.0).r, dm)) * (1.0 - smoothstep(3.0, 4.2, ad));
        }
        gravel = mix(gravel, gravel * vec3(0.62, 0.58, 0.55), scuff * 0.7);
        // round the rocks: the bigger stones, darker
        gravel = mix(gravel, gDeep * 1.6, smoothstep(0.0, 0.03, lump) * 0.35);
        vec3 surf = gravel;
        float sheen = 0.0;
        // ---- the sand: blown over the gravel and out over its shoulders, rippled, two grooves where the wheels go
        float rag = (rtNoiseAt(w + 5.0, 6.0).r - 0.5) * 1.4 + (rtNoiseAt(w * 3.0, 2.0).g - 0.5) * 0.4;
        float sandAmt = pgWin(s + rag * 2.0, PG_SAND.x, PG_SAND.y, 3.0) * (1.0 - smoothstep(4.0, 6.2, ad + rag));
        if (sandAmt > 0.001) {
          float rp = (s * 0.92 + d * 0.38 + rtNoiseAt(w, 5.0).r * 1.6) / 0.22;
          float stn = rel + (rtFbm(w, 12.0) - 0.5) * 0.3 + 0.3 * sh - (1.0 - sh) * 0.3;
          vec3 sand = mix(vec3(0.33, 0.23, 0.2), vec3(0.6, 0.44, 0.25), smoothstep(0.12, 0.45, stn));
          sand = mix(sand, vec3(0.8, 0.63, 0.36), smoothstep(0.55, 0.9, stn));
          float ripple = (1.0 - smoothstep(0.0, 0.35 + rfw, abs(fract(rp) - 0.5) * 2.0 - 0.55)) * (1.0 - smoothstep(0.3, 0.9, rfw)) * near;
          sand *= 1.0 - 0.14 * ripple;
          sand *= mix(1.0, 0.78, exp(-pow((ad - 0.8) / 0.18, 2.0)));
          surf = mix(surf, sand, sandAmt);
        }
        // ---- the mud: dark, wet, glossy, deeper ruts with water standing in them
        float mudAmt = pgWin(s + rag * 1.5, PG_MUD.x, PG_MUD.y, 3.0) * (1.0 - smoothstep(3.8, 5.2, ad + rag * 0.6));
        float pool = 0.0;
        if (mudAmt > 0.001) {
          float mt = rel + (rtFbm(w, 7.0) - 0.5) * 0.4 + 0.25 * sh - (1.0 - sh) * 0.25;
          vec3 mud = mix(vec3(0.035, 0.03, 0.03), vec3(0.11, 0.075, 0.05), smoothstep(0.2, 0.7, mt));
          // a drier crust here and there, in brush-dabs
          float crust = smoothstep(0.6, 0.7, rtStrokeAt(wr * 0.9 + 33.0, 2.6)) * (1.0 - tracks);
          mud = mix(mud, vec3(0.21, 0.16, 0.1) * mix(0.8, 1.1, smoothstep(0.3, 0.7, mt)), crust * 0.55);
          float rut = exp(-pow((ad - 0.8) / 0.3, 2.0));
          mud *= 1.0 - 0.3 * rut;
          // (the water lies in the ruts in pools, broken where the ruts rise)
          float br = rtStrokeAt(vec2(s * 0.45, d * 1.2) + 71.0, 3.3) * 0.7 + rtNoiseAt(vec2(s, d) * 0.6 + 5.0, 7.0).r * 0.3;
          pool = smoothstep(0.6, 0.66, rut * smoothstep(0.38, 0.72, br) * 1.25) * mudAmt;
          surf = mix(surf, mud, mudAmt);
          sheen = max(sheen, mudAmt * (0.55 + 0.45 * rut) * (1.0 - crust * 0.7));
        }
        // ---- the potholes: damp and dark, water in the deepest
        if (lump < -0.002) {
          float pot = smoothstep(-0.007, -0.016, lump);
          float deep = smoothstep(-0.05, -0.065, lump);
          // (its rim: the loose stone thrown out of it, paler)
          float rim = smoothstep(-0.002, -0.004, lump) * (1.0 - smoothstep(-0.006, -0.009, lump));
          surf = mix(surf, gLit * 1.08, rim * 0.5);
          vec3 damp = mix(vec3(0.07, 0.06, 0.055), vec3(0.2, 0.15, 0.11), smoothstep(0.2, 0.7, tone));
          surf = mix(surf, damp, pot * 0.85);
          sheen = max(sheen, pot * 0.35 + deep * 0.4);
          pool = max(pool, deep * smoothstep(0.1, 0.5, uWeather.x + 0.15));
        }
        // ---- the start and the finish: lines of white chalk across the gravel, broken by the stones
        {
          float chalk = max(pgLine(s - PG_OFF_START, 0.09, vec2(1.0, 0.0)), pgLine(s - PG_OFF_FINISH, 0.09, vec2(1.0, 0.0))) * (1.0 - smoothstep(PG_LOOP_HALF - 0.2, PG_LOOP_HALF + 0.2, ad));
          chalk *= mix(1.0, smoothstep(0.25, 0.45, rtNoiseAt(w * 2.0, 1.3).r), near);
          surf = mix(surf, PG_WHITE * 0.95, chalk * 0.9);
        }
        // ---- the shoulders: the land's own grass, trampled near the gravel, the stones thinning out into it
        float gravelIn = 1.0 - smoothstep(PG_LOOP_HALF - 0.1, PG_LOOP_HALF + 1.1, ad + rag * 0.45);
        vec3 shoulder = mix(groundAlb, pal.dry * mix(0.7, 1.1, smoothstep(0.3, 0.7, tone)), 0.35 * (1.0 - smoothstep(PG_LOOP_HALF + 0.4, PG_CORRIDOR - 1.0, ad)));
        shoulder = mix(shoulder, gravel, smoothstep(0.62, 0.7, pb) * (1.0 - smoothstep(PG_LOOP_HALF, PG_LOOP_HALF + 2.2, ad)) * near);
        vec3 albedo = mix(shoulder, surf, gravelIn);
        // ---- the weather: snow over it all, the wheels' ruts in it; the wet darkens; the sky in the wet and the water
        float snow = uWeather.y * smoothstep(0.55, 0.85, n.y + (rtFbm(w, 16.0) - 0.5) * 0.25);
        snow *= 1.0 - 0.7 * tracks * smoothstep(0.3, 0.6, uWeather.y) * gravelIn;
        albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0));
        float wetness = uWeather.x * (1.0 - clamp(snow, 0.0, 1.0));
        albedo *= 1.0 - 0.3 * wetness * gravelIn;
        vec3 col = albedo * rtGroundLight(rtSlopeSun(rel) * sh);
        col += rtHeadlight(albedo, n, vPos);
        vec3 v = normalize(cameraPosition - vPos);
        float gloss = clamp(max(sheen, wetness * 0.45 * gravelIn) * (1.0 - clamp(snow, 0.0, 1.0)), 0.0, 1.0);
        pool *= 1.0 - clamp(snow, 0.0, 1.0);
        if (gloss + pool > 0.01) {
          vec3 up = normalize(mix(n, vec3(0.0, 1.0, 0.0), pool));
          vec3 rd = reflect(-v, up);
          float fres = 0.03 + 0.97 * pow(1.0 - max(dot(up, v), 0.0), 5.0);
          vec3 skyR = rtSkyMirror(rd);
          col = mix(col, skyR * 0.8, gloss * fres * 0.45);
          // (muddy water: the sky in it browned)
          col = mix(col, mix(skyR * 0.8, vec3(0.13, 0.1, 0.07), 0.45), pool * (0.35 + 0.55 * smoothstep(0.0, 0.6, fres)));
          vec3 hv = normalize(v + uSunDir);
          col += uSunColor * pow(max(dot(up, hv), 0.0), mix(60.0, 500.0, pool)) * sh * uSunVis * (gloss * 0.6 + pool * 2.0);
        }
        col = mix(ground, col, 1.0 - smoothstep(PG_CORRIDOR - 1.4, PG_CORRIDOR + 0.3, ad + rag * 0.3));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, farA);
      }`,
  });
}

// ------------------------------------------------------------------ the hill

/** the grade hill: concrete ramps with their edges and their grades painted big; grass slopes, the land's */
export function hillMaterial(glyphs: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: hardUniforms(glyphs),
    vertexShader: /* glsl */ `
      ${VERTEX_HEAD}
      attribute vec3 aPlan;
      varying vec2 vPlan;
      varying float vHillH;
      void main() {
        vBiomeW = aBiomeW;
        vGround = aGround;
        vPlan = aPlan.xy;
        vHillH = aPlan.z;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        ${VERTEX_TAIL}
      }`,
    fragmentShader: /* glsl */ `
      ${FRAG_HEAD}
      varying vec2 vPlan;
      varying float vHillH;
      void main() {
        // (only the level ground about the ramps lies close over the land: the ramps stand well over it)
        pgDepth(1.0 - smoothstep(0.03, 0.2, vHillH));
        gPdx = dFdx(vPlan);
        gPdy = dFdy(vPlan);
        // the facets as they are: planes meeting at sharp creases
        vec3 nf = normalize(cross(dFdx(vPos), dFdy(vPos)));
        if (nf.y < 0.0) nf = -nf;
        // (the grass slopes painted as a painter has a bank: their slope shown, not exaggerated into one flat paint)
        vec3 n = normalize(mix(nf, vec3(0.0, 1.0, 0.0), 0.62));
        vec2 P = vPlan;
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        float sh = rtShadow(vPos, n);
        vec3 groundAlb;
        vec3 ground = rtPaintedGround(vPos, n, vBiomeW, vGround, dist, sh, groundAlb);
        float farA = mix(1.0, 0.5, smoothstep(900.0, 1400.0, dist));
        // which ramp, and where on it
        float idx = clamp(floor((P.y - PG_RAMP_Z.x) / (PG_RAMP_Z.y - PG_RAMP_Z.x) + 0.5), 0.0, 2.0);
        float rz = idx < 0.5 ? PG_RAMP_Z.x : idx < 1.5 ? PG_RAMP_Z.y : PG_RAMP_Z.z;
        float grade = idx < 0.5 ? PG_RAMP_GRADE.x : idx < 1.5 ? PG_RAMP_GRADE.y : PG_RAMP_GRADE.z;
        float up = PG_HILL_RISE / grade;
        float len = 2.0 * up + PG_HILL_TOP;
        float u = PG_HILL_X0 - P.x;
        float dz = P.y - rz;
        float hl = PG_HILL_LANE * 0.5;
        float lane = pgIn(dz, -hl, hl, ${Z}) * pgIn(u, -PG_HILL_APRON, len + 1.0, ${X});
        if (lane < 0.001) {
          gl_FragColor = vec4(rtFog(ground, vPos, cameraPosition), farA);
          return;
        }
        n = nf;
        float near = 1.0 - smoothstep(20.0, 70.0, dist);
        float rel = rtSlopeRel(n);
        // ---- concrete, in slabs: joints across every four metres and down the middle; fine grooves across for grip
        float tone = rel + (rtStrokeAt(w, 4.0) - 0.5) * 0.25 * near + (rtFbm(w, 20.0) - 0.5) * 0.22 + 0.32 * sh - (1.0 - sh) * 0.3;
        vec3 conc = mix(vec3(0.18, 0.2, 0.26), vec3(0.44, 0.43, 0.4), smoothstep(0.12, 0.42, tone));
        conc = mix(conc, vec3(0.66, 0.64, 0.58), smoothstep(0.56, 0.9, tone));
        float slab = rtHash(vec2(floor(u / 4.0), idx * 3.0 + step(0.0, dz))) - 0.5;
        conc *= 1.0 + slab * 0.1;
        float joint = max(pgLine(mod(u + 2.0, 4.0) - 2.0, 0.012, ${X}), pgLine(dz, 0.012, ${Z}));
        conc *= 1.0 - 0.45 * joint;
        float gq = u / 0.16;
        float gfw = pgFw(vec2(1.0 / 0.16, 0.0));
        float groove = (1.0 - smoothstep(0.0, 0.5, abs(fract(gq) - 0.5) * 2.0 - 0.6)) * (1.0 - smoothstep(0.25, 0.7, gfw)) * pgIn(u, 0.4, len - 0.4, ${X});
        conc *= 1.0 - 0.08 * groove;
        float tracks = exp(-pow((abs(dz) - 0.8) / 0.3, 2.0));
        conc *= 1.0 - 0.1 * tracks * pgIn(u, 0.0, len, ${X});
        // rubber where they stopped on the slope and pulled away again
        float startBox = pgIn(u, up * 0.5 - 1.6, up * 0.5 + 1.6, ${X});
        conc = mix(conc, vec3(0.04), 0.4 * startBox * exp(-pow((abs(dz) - 0.8) / 0.14, 2.0)) * smoothstep(0.35, 0.6, rtNoiseAt(w, 3.0).r));
        // stains run down from the edges
        conc = mix(conc, conc * vec3(0.8, 0.82, 0.76), smoothstep(0.55, 0.75, rtNoiseAt(vec2(dz * 2.0, u * 0.3) + 9.0, 13.0).g) * 0.5);
        // ---- the paint: the lane's edges, the hill-start box on each slope, the grade big on each slope, read climbing it
        vec4 acc = vec4(0.0);
        float wear = pgWear(w, tracks);
        pgPut(acc, PG_WHITE, pgLine(abs(dz) - (hl - 0.25), 0.07, ${Z}) * pgIn(u, -PG_HILL_APRON + 0.3, len + 0.8, ${X}) * wear);
        // the apron: a line across where it begins, one at the ramp's foot
        pgPut(acc, PG_WHITE, max(pgLine(u + PG_HILL_APRON - 0.6, 0.1, ${X}), pgLine(u, 0.1, ${X})) * step(abs(dz), hl - 0.25) * wear);
        float boxes = max(pgLine(u - (up * 0.5 - 1.6), 0.07, ${X}), pgLine(u - (up * 0.5 + 1.6), 0.07, ${X}));
        boxes = max(boxes, max(pgLine(u - (len - up * 0.5 - 1.6), 0.07, ${X}), pgLine(u - (len - up * 0.5 + 1.6), 0.07, ${X})));
        pgPut(acc, PG_YELLOW, boxes * step(abs(dz), hl - 0.4) * wear);
        {
          float g = floor(grade * 100.0 + 0.5);
          float gw = 1.35;
          float gh = 3.0;
          // climbing the near slope (towards −x) the right hand is −z; climbing the far one (+x), +z
          vec2 ax1 = vec2(0.0, -1.0 / gw);
          vec2 ay1 = vec2(-1.0 / gh, 0.0);
          vec2 t1 = vec2((1.5 * gw - dz) / gw, (u - 1.2) / gh);
          vec2 ax2 = vec2(0.0, 1.0 / gw);
          vec2 ay2 = vec2(1.0 / gh, 0.0);
          vec2 t2 = vec2((dz + 1.5 * gw) / gw, ((len - 1.2) - u) / gh);
          // (and on the apron, flat, read coming up to the ramp)
          vec2 ay0 = vec2(-1.0 / 3.6, 0.0);
          vec2 t0 = vec2((1.5 * gw - dz) / gw, (u + 15.0) / 3.6);
          bool second = t2.y >= 0.0 && t2.y <= 1.0;
          bool first = !second && t0.y >= 0.0 && t0.y <= 1.0;
          vec2 t = second ? t2 : first ? t0 : t1;
          vec2 tdx = second ? pgTdx(ax2, ay2) : first ? pgTdx(ax1, ay0) : pgTdx(ax1, ay1);
          vec2 tdy = second ? pgTdy(ax2, ay2) : first ? pgTdy(ax1, ay0) : pgTdy(ax1, ay1);
          float num = 0.0;
          if (t.x >= 0.0 && t.x < 3.0 && t.y >= 0.0 && t.y <= 1.0) {
            float i = floor(t.x);
            float code = i < 0.5 ? floor(g / 10.0) : i < 1.5 ? mod(g, 10.0) : 10.0;
            num = pgGlyph(vec2(fract(t.x), t.y), code, tdx, tdy);
          }
          pgPut(acc, PG_WHITE, num * wear);
        }
        conc = conc * (1.0 - acc.a) + acc.rgb;
        // ---- the lane's edge onto the grass: a dark rim, then the slope
        conc *= 1.0 - 0.3 * (1.0 - smoothstep(0.0, 0.07, hl - abs(dz)));
        float wetOut;
        vec3 col = pgHardLit(conc, n, sh, tone, tracks, 1.0, P, dist, wetOut);
        col = mix(ground, col, lane);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, farA);
      }`,
  });
}

// ------------------------------------------------------------------ the glyphs

/** the glyphs, in their cells (4 × 4): the digits, %, 起, 点, 终, /, a blank */
export const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '%', '起', '点', '终', '/', ' '];

/** the squared distances of a 1D row to its nearest set point (Felzenszwalb and Huttenlocher's lower envelope) */
function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** each pixel's distance to the nearest pixel that is set (a 2D distance transform, columns then rows) */
function distanceField(set: Uint8Array, W: number, H: number): Float64Array {
  const INF = 1e12;
  const g = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) g[i] = set[i] ? 0 : INF;
  const n = Math.max(W, H);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) f[y] = g[y * W + x];
    edt1d(f, H, d, v, z);
    for (let y = 0; y < H; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) f[x] = g[y * W + x];
    edt1d(f, W, d, v, z);
    for (let x = 0; x < W; x++) g[y * W + x] = Math.sqrt(d[x]);
  }
  return g;
}

/**
 * The glyphs painted on the ground as distance fields (0.5 on the edge): crisp however close one stands to them, the
 * shader blurring them only as they shrink. The UI's own faces (ui.ts): Bahnschrift for the figures, the Chinese in
 * Microsoft YaHei.
 */
export function glyphAtlas(): THREE.DataTexture {
  const C = 128;
  const N = 4;
  const S = C * N;
  const out = new Uint8Array(S * S);
  const canvas = document.createElement('canvas');
  canvas.width = C;
  canvas.height = C;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  const spread = 10;
  GLYPHS.forEach((ch, code) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, C, C);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const cjk = /[一-鿿]/.test(ch);
    g.font = cjk ? `bold ${C * 0.78}px "Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif` : `bold ${C * 0.92}px "Bahnschrift", "Arial Narrow", "Arial", sans-serif`;
    g.save();
    g.translate(C / 2, C / 2 + (cjk ? 2 : 4));
    // (the figures set close, filling their cells: a road's figures are tall and tight)
    if (!cjk) g.scale(ch === '%' ? 1.0 : ch === '/' ? 1.0 : 1.32, 1);
    g.fillText(ch, 0, 0);
    g.restore();
    const img = g.getImageData(0, 0, C, C).data;
    const inside = new Uint8Array(C * C);
    const outside = new Uint8Array(C * C);
    for (let i = 0; i < C * C; i++) {
      inside[i] = img[i * 4] > 127 ? 1 : 0;
      outside[i] = 1 - inside[i];
    }
    const dOut = distanceField(inside, C, C);
    const dIn = distanceField(outside, C, C);
    const cx = code % N;
    const cy = Math.floor(code / N);
    for (let y = 0; y < C; y++) {
      for (let x = 0; x < C; x++) {
        const i = y * C + x;
        const sd = inside[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5);
        const v = Math.max(0, Math.min(255, Math.round((0.5 + sd / (2 * spread)) * 255)));
        // (the texture's rows run up: the glyph's top row goes at its cell's top)
        const ty = cy * C + (C - 1 - y);
        out[ty * S + cx * C + x] = v;
      }
    }
  });
  const t = new THREE.DataTexture(out, S, S, THREE.RedFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}
