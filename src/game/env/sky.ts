/**
 * The sky dome (STYLE.md §7): a painted gradient — pale at the horizon, a mid band, deep
 * saturated blue overhead — the sun with its three glows and a disc bright enough for bloom,
 * the cumulus from their cube map, an overcast deck for grey days, and the night sky.
 * Alpha < 0.6 tells the paint finish the sky is painted already.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals } from '../render/shaderlib';

export const skyUniforms = {
  uZenith: { value: new THREE.Color(0.035, 0.25, 0.62) },
  uMid: { value: new THREE.Color(0.08, 0.39, 0.72) },
  uHorizon: { value: new THREE.Color(0.38, 0.7, 0.84) },
  uGlow: { value: new THREE.Color(0.5, 0.5, 0.45) },
  uDisc: { value: new THREE.Color(2.7, 2.55, 2.2) },
  uSunDisc: { value: new THREE.Vector3(0, 1, 0) },
  uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
  uSunVis: { value: 1 },
  tClouds: { value: null as THREE.Texture | null },
  uCloudsOn: { value: 0 },
  /** x: overcast deck 0..1, y: deck darkness, zw: drift */
  uDeck: { value: new THREE.Vector4(0, 0, 0, 0) },
  uDeckLit: { value: new THREE.Color(0.7, 0.74, 0.8) },
  uDeckShade: { value: new THREE.Color(0.4, 0.44, 0.52) },
  uStars: { value: 0 },
  /**
   * the night sky (V1, docs/V3/nodes/V1-light.md): x how clear the air is (the stars' brightness: 1 a clear lowland
   * night, more in dry and high country), y meteors (0 none … 1 a shower), z the moon's phase (0 new … 0.5 full … 1),
   * w the stars' turn about the pole (rad)
   */
  uNight: { value: new THREE.Vector4(1, 0.15, 0.5, 0) },
  /** the night's dice: where its meteors come from (x, y: the radiant's azimuth and height), z its seed */
  uMeteor: { value: new THREE.Vector3(0.8, 0.7, 0) },
  uAurora: { value: 0 },
  /**
   * the layers above the heaps (V1b, docs/V3/nodes/V1b-clouds.md): x cirrus, y cirrocumulus, z altocumulus, w a veil
   * (altostratus) — how much of each, 0 … 1
   */
  uHigh: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** how far the winds have carried them (m): xy the high layers', zw the middle ones' */
  uLayerDrift: { value: new THREE.Vector4(0, 0, 0, 0) },
  /** billows (V1b): x how much, y the direction they run across (rad), z their spacing (m), w 1 for a single long ribbon instead */
  uWaves: { value: new THREE.Vector4(0, 0, 900, 0) },
  /** the light on the high layers and on the middle ones (each lit by the sun as it stands for its height: after sunset the high ones glow), and their shade */
  uHighLit: { value: new THREE.Color(1.2, 1.2, 1.15) },
  uMidLit: { value: new THREE.Color(1.2, 1.2, 1.15) },
  uLayerShade: { value: new THREE.Color(0.5, 0.6, 0.75) },
  /** a lenticular stack over a peak: x its azimuth (rad, as atan(z, x)), y its elevation (rad), z its half width (rad), w how strong */
  uLens: { value: new THREE.Vector4(0, 0.1, 0.1, 0) },
  /** noctilucent clouds (polar summer twilight): how much */
  uNlc: { value: 0 },
  /** twilight (V1): the belt of Venus opposite a low sun — rgb its pink, w how strong; uRise: how high the earth's shadow under it has risen (sin of the angle) */
  uBelt: { value: new THREE.Vector4(0, 0, 0, 0) },
  uRise: { value: 0.02 },
  uRainbow: { value: 0 },
  uFlash: { value: 0 },
  /** the front: xy = unit vector (xz) towards where the weather stands, z = how far it has come over 0..1, w = rain hanging under it 0..1 */
  uStorm: { value: new THREE.Vector4(1, 0, 0, 0) },
  /** a lightning bolt: xy = unit vector (xz) towards it, z = its shape (a seed), w = brightness 0..1 */
  uBolt: { value: new THREE.Vector4(1, 0, 0, 0) },
  /** low cloud bank along the horizon: amount 0..1, lit and shaded colours */
  uBank: { value: 0.8 },
  uBankLit: { value: new THREE.Color(1.24, 1.22, 1.16) },
  uBankShade: { value: new THREE.Color(0.37, 0.51, 0.7) },
};

/** the uniforms a surface needs to mirror the sky (water, puddles): the dome's own, shared */
export function skyMirrorUniforms(): Record<string, THREE.IUniform> {
  const u = skyUniforms;
  return { uZenith: u.uZenith, uMid: u.uMid, uHorizon: u.uHorizon, uGlow: u.uGlow, uSunDisc: u.uSunDisc, uMoonDir: u.uMoonDir, uSunVis: u.uSunVis, tClouds: u.tClouds, uCloudsOn: u.uCloudsOn, uDeck: u.uDeck, uDeckLit: u.uDeckLit, uDeckShade: u.uDeckShade, uStorm: u.uStorm };
}

/**
 * GLSL: the sky as the dome paints it, for a direction d — without the things too small to matter
 * upside down (stars, the bank, the bolt). Needs skyMirrorUniforms().
 */
export const GLSL_SKY_MIRROR = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uSunDisc;
  uniform vec3 uMoonDir;
  uniform float uSunVis;
  uniform samplerCube tClouds;
  uniform float uCloudsOn;
  uniform vec4 uDeck;
  uniform vec3 uDeckLit;
  uniform vec3 uDeckShade;
  uniform vec4 uStorm;
  vec3 rtSkyMirror(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(h, 0.8)));
    col = mix(col, uZenith, smoothstep(0.18, 0.85, h));
    float sd = max(dot(d, uSunDisc), 0.0);
    col += uGlow * (pow(sd, 6.0) * 0.05 + pow(sd, 90.0) * 0.3) * uSunVis;
    if (uCloudsOn > 0.5) {
      vec4 c = textureCube(tClouds, vec3(d.x, max(d.y, 0.02), d.z));
      col = col * (1.0 - c.a) + c.rgb;
    }
    // the deck, and the front of a storm where it has come over
    float cover = uDeck.x;
    if (uStorm.z > 0.002) {
      float along = dot(d.xz / (max(d.y, 0.0) + 0.15), uStorm.xy);
      cover = max(cover, smoothstep(-0.4, 0.4, along - mix(7.6, -7.6, uStorm.z)));
    }
    col = mix(col, mix(uDeckLit, uDeckShade, 0.45 + 0.3 * uDeck.y), cover * 0.9);
    return col;
  }
`;

export function skyDomeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    uniforms: { ...globals, ...skyUniforms },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_COMMON}
      uniform vec3 uZenith;
      uniform vec3 uMid;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uDisc;
      uniform vec3 uSunDisc;
      uniform vec3 uMoonDir;
      uniform float uSunVis;
      uniform samplerCube tClouds;
      uniform float uCloudsOn;
      uniform vec4 uDeck;
      uniform vec3 uDeckLit;
      uniform vec3 uDeckShade;
      uniform float uStars;
      uniform vec4 uNight;
      uniform vec3 uMeteor;
      uniform float uAurora;
      uniform vec4 uBelt;
      uniform float uRise;
      uniform vec4 uHigh;
      uniform vec4 uLayerDrift;
      uniform vec4 uWaves;
      uniform vec3 uHighLit;
      uniform vec3 uMidLit;
      uniform vec3 uLayerShade;
      uniform vec4 uLens;
      uniform float uNlc;
      uniform float uRainbow;
      uniform float uFlash;
      uniform float uBank;
      uniform vec3 uBankLit;
      uniform vec3 uBankShade;
      uniform vec4 uStorm;
      uniform vec4 uBolt;
      varying vec3 vDir;

      float h21(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }
      float h31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      float vnoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      float fbm(vec2 p) {
        float a = 0.5;
        float s = 0.0;
        for (int i = 0; i < 4; i++) {
          s += a * vnoise(p);
          p = p * 2.03 + 11.7;
          a *= 0.5;
        }
        return s;
      }
      vec3 spectrum(float t) {
        return clamp(vec3(1.5 - abs(4.0 * t - 1.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 3.0)), 0.0, 1.0);
      }

      // rounded puffs on a sheet (V1b): one to a cell of sz metres where the cover lets it, as big as its cell says,
      // soft edged — x how much cloud, y how lit (its side toward the sun); from the cells' seeds (render/textures.ts)
      vec2 rtPuffs(vec2 P, float sz, float cover, vec2 sunH, float r0, float r1) {
        vec4 c = texture2D(tCells, P / (sz * 64.0));
        float d1 = c.a * 0.5;
        float r = mix(r0, r1, c.b);
        float p = (1.0 - smoothstep(r * 0.5, r, d1)) * step(c.g, cover);
        vec4 cs = texture2D(tCells, (P + sunH * sz * r * 0.45) / (sz * 64.0));
        float lit = smoothstep(-0.03, 0.05, cs.a * 0.5 - d1);
        return vec2(p, lit);
      }

      // (G1) how far along the eye's ray a layer H metres up is, over a round earth — a small one, as a painter's: the far
      // sky's clouds are low and small over the horizon, not lines running out to a point
      float rtLayerT(vec3 d, float H) {
        const float R = 90000.0;
        float s = max(d.y, 0.0);
        return sqrt(R * R * s * s + 2.0 * R * H + H * H) - R * s;
      }

      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(h, 0.8)));
        col = mix(col, uZenith, smoothstep(0.18, 0.85, h));
        // ---- twilight (V1): opposite a setting (or rising) sun the earth's own shadow, a band of blue grey along the
        // horizon rising as the sun goes down, and over it the pink belt of Venus
        if (uBelt.w > 0.01 && d.y > -0.02) {
          vec2 hz = normalize(d.xz + 1e-5);
          vec2 as = -normalize(uSunDisc.xz + 1e-5);
          float anti = smoothstep(-0.35, 0.85, dot(hz, as));
          float inShade = 1.0 - smoothstep(uRise - 0.012, uRise + 0.012, d.y);
          float belt = smoothstep(uRise - 0.004, uRise + 0.035, d.y) * (1.0 - smoothstep(uRise + 0.06, uRise + 0.24, d.y));
          vec3 shade = vec3(dot(col, vec3(0.333))) * vec3(0.7, 0.78, 1.05);
          col = mix(col, shade, inShade * anti * uBelt.w * 0.75);
          col = mix(col, uBelt.rgb, belt * anti * uBelt.w * 0.6);
        }

        // ---- night (V1): the sky of a country with no lights in it — three layers of stars of their own colours, the
        // Milky Way with its bright core, its arms and its dark rifts, meteors, the moon in its phase. The sky turns about
        // the pole (north, -z, forty degrees up) through the night.
        float pix = max(length(fwidth(d)), 4e-4);
        if (uStars > 0.01 && d.y > -0.03) {
          vec3 P = normalize(vec3(0.0, 0.643, -0.766));
          float ct = cos(uNight.w);
          float st = sin(uNight.w);
          vec3 c = d * ct + cross(P, d) * st + P * dot(P, d) * (1.0 - ct);
          float up = smoothstep(-0.03, 0.22, d.y);
          // (the Milky Way: a band about the galactic equator, its core one way along it)
          // (at half past nine its core low in the east-north-east, ahead of a road that runs east and in the band of sky
          // the windscreen shows, the band rising from the north-north-east horizon through it and over the south)
          vec3 e1 = normalize(vec3(0.93, 0.21, -0.29));
          vec3 G = normalize(cross(vec3(0.6, 0.0, -0.8), e1));
          vec3 e2 = cross(G, e1);
          float gb = dot(c, G);
          float gl = atan(dot(c, e2), dot(c, e1));
          float core = exp(-gl * gl * 1.6);
          float wid = 0.13 + 0.12 * core;
          float band = exp(-gb * gb / (wid * wid));
          vec2 gq = vec2(gl * 2.6, gb * 11.0);
          float n1 = fbm(gq + 3.1);
          float n2 = fbm(gq * 2.9 + 7.3);
          float n3 = fbm(gq * 7.0 + 1.7);
          float glow = band * (0.45 + 0.9 * n1) * (0.75 + 0.5 * n2);
          // the dark rifts down its middle, wandering, deepest toward the core
          float riftY = gb - 0.035 * sin(gl * 2.3 + 0.7) - (n2 - 0.5) * 0.07;
          float rift = exp(-riftY * riftY / pow(0.018 + 0.026 * core, 2.0)) * smoothstep(0.35, 0.65, n1 + 0.15 * core);
          glow *= 1.0 - 0.8 * rift;
          glow *= 0.8 + 0.4 * n3;
          float moonWash = 1.0 - 0.75 * smoothstep(0.2, 0.9, 1.0 - abs(uNight.z * 2.0 - 1.0)) * smoothstep(-0.05, 0.25, uMoonDir.y);
          vec3 mw = mix(vec3(0.42, 0.52, 1.0), vec3(1.0, 0.8, 0.55), core * 0.85);
          mw = mix(mw, vec3(0.9, 0.5, 0.85), smoothstep(0.6, 0.8, n2) * 0.45 * (1.0 - core));
          mw = mix(mw, vec3(0.4, 0.85, 0.9), smoothstep(0.66, 0.85, n3) * 0.25);
          col += mw * glow * (0.1 + 0.26 * core) * uStars * uNight.x * up * moonWash;
          // (three layers of stars on the faces of a cube, by equal angles: the bright few, the many, the dust of them —
          // more of the faint ones in the band)
          vec3 a = abs(c);
          vec2 fu;
          float face;
          if (a.x >= a.y && a.x >= a.z) { fu = c.yz / a.x; face = c.x > 0.0 ? 0.0 : 1.0; }
          else if (a.y >= a.z) { fu = c.xz / a.y; face = c.y > 0.0 ? 2.0 : 3.0; }
          else { fu = c.xy / a.z; face = c.z > 0.0 ? 4.0 : 5.0; }
          fu = atan(fu) * 1.2732395;
          vec3 stars = vec3(0.0);
          for (int L = 0; L < 3; L++) {
            float n = L == 0 ? 26.0 : L == 1 ? 70.0 : 170.0;
            float pr = L == 0 ? 0.09 : L == 1 ? 0.26 : 0.16 + 0.7 * band;
            vec2 g = (fu * 0.5 + 0.5) * n;
            vec2 cell = floor(g);
            float hs = h21(cell + face * 517.0 + float(L) * 91.3);
            if (hs > pr) continue;
            vec2 off = vec2(h21(cell + face * 13.7 + 3.1 + float(L)), h21(cell + face * 29.3 + 7.9 + float(L))) * 0.5 + 0.25;
            // (the angle from the star: a cell is about 1.57 / n radians wide)
            float r = length(g - cell - off) * 1.5708 / n;
            float m = fract(hs * 93.17 / max(pr, 1e-3));
            float bright = (L == 0 ? 3.2 : L == 1 ? 0.75 : 0.36) * (0.25 + 1.75 * pow(m, 3.0));
            float rs = (L == 0 ? 1.0 : L == 1 ? 0.6 : 0.5) * pix * (0.6 + 0.6 * m);
            float sig = max(rs, 0.75 * pix);
            float sh = bright * (rs * rs) / (sig * sig) * exp(-r * r / (2.0 * sig * sig));
            // (the brightest: a soft halo, and a twinkle, stronger low in the sky)
            if (L == 0) sh += bright * 0.06 * exp(-r / (5.0 * pix)) * smoothstep(0.75, 1.0, m);
            float tw = 1.0 + (0.18 + 0.4 * (1.0 - smoothstep(0.05, 0.5, d.y))) * sin(uTime * (2.0 + 5.0 * fract(hs * 41.3)) + hs * 60.0);
            float temp = fract(hs * 57.31);
            vec3 tint = temp < 0.18 ? vec3(0.72, 0.84, 1.25) : temp < 0.55 ? vec3(1.0) : temp < 0.8 ? vec3(1.12, 1.0, 0.8) : temp < 0.93 ? vec3(1.2, 0.86, 0.62) : vec3(1.25, 0.7, 0.55);
            stars += tint * sh * tw;
          }
          col += stars * uStars * uNight.x * up * (0.55 + 0.45 * moonWash);
          // a faint airglow band low over the horizon, green-teal
          col += vec3(0.012, 0.03, 0.026) * exp(-pow((d.y - 0.07) / 0.07, 2.0)) * uStars * uNight.x;
          // ---- meteors: three slots, each now and then a streak away from the night's radiant
          if (uNight.y > 0.01) {
            vec3 R = normalize(vec3(cos(uMeteor.x) * cos(uMeteor.y), sin(uMeteor.y), sin(uMeteor.x) * cos(uMeteor.y)));
            for (int i = 0; i < 3; i++) {
              float period = mix(16.0, 3.2, uNight.y);
              float tt = uTime / period + float(i) * 0.371;
              float slot = floor(tt);
              float hm = h21(vec2(slot + uMeteor.z, float(i) * 7.13));
              if (hm > 0.35 + 0.6 * uNight.y) continue;
              float life = mix(0.45, 1.1, h21(vec2(slot * 1.71, float(i) + uMeteor.z)));
              float t0 = (slot + 0.1 + 0.6 * h21(vec2(slot, float(i) + 3.3 + uMeteor.z)) - float(i) * 0.371) * period;
              float t = (uTime - t0) / life;
              if (t < 0.0 || t > 1.0) continue;
              // where it starts: somewhere up the sky, moving away from the radiant
              float az = h21(vec2(slot * 3.1, float(i) + 11.0 + uMeteor.z)) * 6.2832;
              float el = mix(0.3, 1.05, h21(vec2(slot * 5.7, float(i) + 17.0 + uMeteor.z)));
              vec3 p0 = normalize(vec3(cos(az) * cos(el), sin(el), sin(az) * cos(el)));
              vec3 nrm = normalize(cross(R, p0));
              vec3 along = cross(nrm, p0);
              float len = mix(0.12, 0.38, h21(vec2(slot * 2.3, float(i) + 23.0 + uMeteor.z)));
              float ang = atan(dot(d, along), dot(d, p0));
              float off = abs(dot(d, nrm));
              float head = t * len;
              float tail = len * 0.4 * min(1.0, t * 2.5);
              float k = clamp((ang - head + tail) / max(tail, 1e-3), 0.0, 1.0) * step(ang, head) * step(0.0, dot(d, p0) + 0.5);
              float w = exp(-off * off / pow(0.9 * pix, 2.0)) + 0.12 * exp(-off / (3.0 * pix));
              float fade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.65, 1.0, t));
              float b = mix(1.2, 3.5, h21(vec2(slot * 7.7, float(i) + 31.0 + uMeteor.z)));
              col += mix(vec3(0.5, 0.95, 0.85), vec3(1.4, 1.45, 1.5), k * k) * k * k * w * fade * b * uStars;
            }
          }
        }
        if (uAurora > 0.01 && d.y > 0.0) {
          // (curtains hung over the north: on a sheet high up, folded by a slow wave, their feet a sharp green edge,
          // their tops fading through to violet, rayed along their height)
          vec2 pl = d.xz / (d.y + 0.08);
          float fold = fbm(vec2(pl.x * 0.35 + uTime * 0.012, 1.3)) * 3.0 + fbm(vec2(pl.x * 1.1 - uTime * 0.02, 4.1)) * 0.8;
          float zc = -2.2 + fold + 0.6 * sin(pl.x * 0.6 + uTime * 0.05);
          float y = zc - pl.y;
          float foot = smoothstep(-0.05, 0.08, y);
          float height = exp(-max(y, 0.0) * 1.15);
          float rays = 0.55 + 0.45 * vnoise(vec2(pl.x * 9.0 + fold * 3.0, uTime * 0.25));
          float sheet = foot * height * rays * smoothstep(0.2, 0.9, fbm(vec2(pl.x * 0.5 + 9.0, uTime * 0.01)) + 0.35);
          vec3 ac = mix(vec3(0.1, 0.95, 0.42), vec3(0.55, 0.2, 0.9), smoothstep(0.15, 1.2, y));
          ac = mix(ac, vec3(0.9, 0.25, 0.45), smoothstep(1.6, 2.4, y) * 0.5);
          col += ac * sheet * uAurora * 0.32 * smoothstep(0.0, 0.25, d.y);
        }

        // ---- the sun: three glows and a disc bright enough to bloom
        float sd = max(dot(d, uSunDisc), 0.0);
        col += uGlow * (pow(sd, 6.0) * 0.05 + pow(sd, 90.0) * 0.3 + pow(sd, 1400.0) * 1.4) * uSunVis;
        col += uDisc * smoothstep(0.99988, 0.99996, sd) * 8.0 * uSunVis;
        // ---- the moon, in its phase: lit on the side toward the sun, earthshine on the rest, a halo as bright as it is full
        float md = max(dot(d, uMoonDir), 0.0);
        float lit = 1.0 - abs(uNight.z * 2.0 - 1.0);
        // (a new moon is not seen at all: it stands by the sun)
        float moon = smoothstep(0.99972, 0.99986, md) * smoothstep(-0.02, 0.04, uMoonDir.y) * smoothstep(0.03, 0.14, lit);
        if (moon > 0.0) {
          vec3 mx = normalize(cross(vec3(0.0, 1.0, 0.0), uMoonDir));
          vec3 my = cross(uMoonDir, mx);
          vec2 q = vec2(dot(d, mx), dot(d, my)) / 0.0167;
          float rim = sqrt(max(1.0 - dot(q, q), 0.0));
          float ph = uNight.z * 6.2832;
          float term = cos(ph) * sqrt(max(1.0 - q.y * q.y, 0.0));
          float sideSun = uNight.z < 0.5 ? q.x - term : -q.x - term;
          float on = smoothstep(-0.04, 0.04, sideSun);
          float maria = 0.72 + 0.28 * smoothstep(0.35, 0.65, vnoise(q * 3.1 + 4.0) * 0.7 + vnoise(q * 7.3) * 0.3);
          vec3 face = vec3(1.0, 0.97, 0.9) * maria * (0.75 + 0.25 * rim) * 1.6;
          col = mix(col, face * on + (col * 0.55 + vec3(0.006, 0.008, 0.014)) * (1.0 - on), moon);
        }
        col += vec3(0.1, 0.13, 0.22) * (pow(md, 900.0) * 0.6 + pow(md, 90.0) * 0.5 + pow(md, 12.0) * 0.06) * lit * smoothstep(-0.05, 0.1, uMoonDir.y) * (1.0 - uSunVis * 0.8);

        // ---- rainbow, opposite the sun
        if (uRainbow > 0.01) {
          float ang = degrees(acos(clamp(dot(d, -uSunDisc), -1.0, 1.0)));
          float bandR = smoothstep(39.6, 40.4, ang) * (1.0 - smoothstep(42.0, 42.8, ang));
          col += spectrum(1.0 - (ang - 39.8) / 2.8) * bandR * uRainbow * 0.32 * smoothstep(0.0, 0.12, d.y);
        }

        // ---- the layers above the heaps (V1b): each a plane over the land at its own height, where the eye's ray
        // meets it, world-anchored (they pass overhead as one drives) and drifting with its wind; what is finer than a
        // pixel there runs together into the layer's mean, so nothing shimmers toward the horizon
        if (d.y > 0.0 && uHigh.x + uHigh.y + uHigh.z + uHigh.w + uWaves.x + uLens.w > 0.004) {
          vec2 camW = rtWorldXZ(cameraPosition);
          vec2 wdir = normalize(uWind.xy + vec2(1e-4, 0.0));
          vec2 wper = vec2(-wdir.y, wdir.x);
          vec2 sunH = normalize(uSunDisc.xz + vec2(1e-4, 0.0));
          float low = smoothstep(0.0, 0.09, d.y);
          float toSun = dot(normalize(d.xz + 1e-5), sunH) * 0.5 + 0.5;
          // (G1: each layer where the eye's ray meets it over a round earth, rtLayerT — the far sky's clouds low and small
          // over the horizon, not a fan of lines running to a point; each in its own patches and bands with clean sky
          // between, thin enough at its edges for the blue to show through)
          // ---- the veil: cirrostratus, a thin milk over a part of the sky, the sun's halo in its ice
          if (uHigh.w > 0.004) {
            float t = rtLayerT(d, 5500.0);
            vec2 Pv = camW + d.xz * t + uLayerDrift.zw;
            float vt = texture2D(tNoise, Pv / 41000.0).g * 0.7 + texture2D(tNoise, Pv / 9000.0).b * 0.3;
            float veil = uHigh.w * smoothstep(0.25, 0.7, vt + uHigh.w * 0.35) * low;
            col = mix(col, mix(uLayerShade, uMidLit, 0.62 + 0.25 * toSun), veil * 0.55);
            // (a pale ring 22° out from the sun, a little red on its inside)
            float ang = degrees(acos(clamp(dot(d, uSunDisc), -1.0, 1.0)));
            float ring = exp(-pow((ang - 22.3) / 1.1, 2.0));
            float inner = exp(-pow((ang - 21.2) / 0.8, 2.0));
            col += (uHighLit * 0.22 * ring + vec3(0.2, 0.08, 0.02) * inner * 0.3) * veil * uSunVis * 1.6;
          }
          // ---- cirrus: mares' tails — a hooked head of ice and the long hair the high wind combs out of it; a flight of
          // them here, another there, the blue between
          if (uHigh.x > 0.004) {
            float t = rtLayerT(d, 9000.0);
            vec2 P = camW + d.xz * t + uLayerDrift.xy;
            float mpp = t * pix / max(d.y + 0.2, 0.2);
            // (the wind's way turns slowly across the sky: the tails are combed along it)
            float turn = (texture2D(tNoise, P / 190000.0 + 0.7).r - 0.5) * 1.5;
            vec2 fd = wdir * cos(turn) + wper * sin(turn);
            vec2 q = vec2(dot(P, fd), dot(P, vec2(-fd.y, fd.x)));
            float flightN = texture2D(tNoise, q / vec2(110000.0, 60000.0) + vec2(uTime * 0.0003, 0.31)).b * 0.75 + texture2D(tNoise, q / 23000.0).g * 0.25;
            float flight = smoothstep(0.62 - 0.36 * uHigh.x, 0.8 - 0.3 * uHigh.x, flightN);
            float fine = 1.0 - smoothstep(40.0, 200.0, mpp);
            float dens = 0.0;
            for (int k = 0; k < 2; k++) {
              vec2 cs = k == 0 ? vec2(12500.0, 2900.0) : vec2(7400.0, 1800.0);
              vec2 g = q / cs + float(k) * 13.7;
              g.x += floor(g.y) * 0.37;
              vec2 id = floor(g);
              vec2 f = fract(g);
              float h1 = rtHash(id + 3.1);
              float h2 = rtHash(id + 17.3);
              // (0 at its head … 1 at the end of its hair; the hair sags off to one side as it trails: the hook)
              float x = (f.x - 0.1) / 0.84;
              float cy = 0.5 + (h2 - 0.5) * 0.3 + 0.34 * x * x * (h1 - 0.45);
              float wd = mix(0.045, 0.17, clamp(x, 0.0, 1.0));
              float prof = exp(-pow((f.y - cy) / wd, 2.0));
              float env = smoothstep(-0.02, 0.05, x) * pow(max(1.0 - x, 0.0), 1.4);
              float hair = texture2D(tNoise, vec2(q.x / 9000.0, q.y / 210.0) + h1).r * 0.6 + texture2D(tNoise, vec2(q.x / 3100.0, q.y / 75.0) + h2).g * 0.4;
              dens += prof * env * mix(0.7, 0.3 + 1.1 * hair, fine) * step(h1, 0.35 + 0.5 * uHigh.x);
            }
            float c = clamp(dens * 1.15, 0.0, 1.0) * flight * low;
            col = mix(col, mix(uHighLit, uLayerShade, 0.12 * (1.0 - toSun)), c * 0.74);
          }
          // ---- cirrocumulus: a ripple of small grains high up, in a patch or two — rows across the wind breaking into
          // grains, thinning out at the patch's edge
          if (uHigh.y > 0.004) {
            float t = rtLayerT(d, 7200.0);
            vec2 P = camW + d.xz * t + uLayerDrift.xy * 0.85;
            float mpp = t * pix / max(d.y + 0.2, 0.2);
            vec2 q = vec2(dot(P, wdir), dot(P, wper));
            float patchC = texture2D(tNoise, P / 60000.0 + vec2(5.0, uTime * 0.0004)).a * 0.7 + texture2D(tNoise, P / 14000.0 + 2.0).r * 0.3;
            // (a patch or two, a third of the sky at most: how much of it there is thickens them, it does not spread them)
            float cover = smoothstep(0.6, 0.78, patchC + 0.1 * (uHigh.y - 0.5));
            vec2 wq = q + (texture2D(tNoise, P / 5200.0).rg - 0.5) * 900.0 + (texture2D(tNoise, P / 1700.0 + 0.4).rg - 0.5) * 260.0;
            // (the rows' spacing its own from one part of a patch to the next; the rows broken into grains, the grains uneven)
            float wide = 0.75 + 0.6 * texture2D(tNoise, P / 21000.0 + 7.0).g;
            float rows = 0.5 + 0.5 * sin(wq.x / (62.0 * wide));
            float grain = 0.5 + 0.5 * sin(wq.y / (95.0 * wide) + sin(wq.x / 310.0) * 2.0);
            float sharp = 1.0 - smoothstep(60.0, 240.0, mpp);
            float g = smoothstep(0.42, 0.85, rows * (0.4 + 0.6 * grain) + (texture2D(tNoise, wq / 900.0).g - 0.5) * 0.7);
            float amount = mix(0.34, g, sharp) * cover * low * (0.55 + 0.45 * uHigh.y);
            col = mix(col, mix(uLayerShade, uHighLit, 0.82), amount * 0.6);
          }
          // ---- altocumulus: the flock — a sheet of rounded heaps in a band or two across the sky, the heaps thick in the
          // band's middle and thinning to nothing at its ragged edge, each lit on its sun side and blue-grey under
          if (uHigh.z > 0.004) {
            float t = rtLayerT(d, 4300.0);
            vec2 P = camW + d.xz * t + uLayerDrift.zw;
            float mpp = t * pix / max(d.y + 0.2, 0.2);
            vec2 q = vec2(dot(P, wdir), dot(P, wper));
            // (the bands lie across the wind, long)
            float bandN = texture2D(tNoise, vec2(q.x / 30000.0, q.y / 120000.0) + vec2(uTime * 0.0006, 11.0)).g * 0.72 + texture2D(tNoise, P / 9000.0 + 3.0).r * 0.28;
            // (a band or two, two fifths of the sky at most: how much of it there is thickens the flock, it does not spread it)
            float cover = smoothstep(0.54, 0.74, bandN + 0.12 * (uHigh.z - 0.5));
            vec2 wp = P + (texture2D(tNoise, P / 6400.0 + 0.2).rg - 0.5) * 620.0;
            vec2 p1 = rtPuffs(wp, 560.0, 0.15 + 0.8 * cover, sunH, 0.3, 0.5);
            vec2 p2 = rtPuffs(wp + vec2(311.0, 97.0), 250.0, 0.3 + 0.6 * cover, sunH, 0.28, 0.44);
            float sharp = 1.0 - smoothstep(110.0, 460.0, mpp);
            float body = max(p1.x, p2.x * 0.7);
            float lit = mix(p1.y, p2.y, step(p1.x, p2.x * 0.7));
            // (a heap is thick in its middle and thin at its rim: its sun side white, the rest of it the sky's blue grey)
            float soft = (texture2D(tNoise, wp / 420.0).b - 0.5) * 0.4;
            // (soft: each heap fades out to its rim, no cut edge — they were white paper shapes laid on the blue)
            float thickK = clamp(body * 1.2 + soft * body * 1.6, 0.0, 1.0);
            thickK = thickK * thickK * (3.0 - 2.0 * thickK);
            float amount = mix(0.5 * cover, thickK * smoothstep(0.0, 0.3, cover), sharp) * (0.62 + 0.38 * uHigh.z);
            // (its sun side white where it is thick; the rest of it, and all its thin rim, the layer's blue grey)
            vec3 ac = mix(uLayerShade * 0.97, uMidLit, mix(0.5 + 0.2 * toSun, 0.1 + 0.9 * lit * smoothstep(0.25, 0.85, thickK), sharp));
            col = mix(col, ac, amount * low * 0.86);
          }
          // ---- billows: soft parallel rolls of cloud where the wind shears, broken along their length, each lit on its sun
          // side — or one long ribbon right across the sky
          if (uWaves.x > 0.004) {
            float t = rtLayerT(d, 3600.0);
            vec2 P = camW + d.xz * t + uLayerDrift.zw * 0.7;
            vec2 wd = vec2(cos(uWaves.y), sin(uWaves.y));
            float across = dot(P, wd);
            float along = dot(P, vec2(-wd.y, wd.x));
            float mpp = t * pix / max(d.y + 0.2, 0.2);
            float wob = texture2D(tNoise, vec2(along / 30000.0, across / 60000.0) + 0.4).r;
            float c;
            float lit;
            if (uWaves.w > 0.5) {
              // (a ribbon a kilometre wide, tens of kilometres long, straight but for a slow wander, frayed at its edges)
              float off = across - 2400.0 + (wob - 0.5) * 1800.0;
              float fray = texture2D(tNoise, vec2(along / 2600.0, across / 900.0)).g;
              c = (1.0 - smoothstep(260.0, 640.0, abs(off) + (fray - 0.5) * 420.0)) * smoothstep(0.25, 0.5, texture2D(tNoise, vec2(along / 90000.0, 0.3)).b + 0.2);
              lit = smoothstep(-300.0, 300.0, off * sign(dot(wd, sunH)));
            } else {
              float ph = across / uWaves.z + (wob - 0.5) * 3.0;
              float roll = 0.5 + 0.5 * sin(ph * 6.2832);
              float sharp = 1.0 - smoothstep(uWaves.z * 0.12, uWaves.z * 0.4, mpp);
              // (the rolls ragged: thick here, a wisp there along their length, in one field of them)
              float rag = texture2D(tNoise, vec2(along / 5200.0, ph * 0.13)).b;
              float fray = texture2D(tNoise, vec2(along / 1300.0, across / 700.0)).g;
              float env = smoothstep(0.5, 0.72, texture2D(tNoise, P / 70000.0 + vec2(21.0, uTime * 0.0004)).a);
              c = mix(0.3, smoothstep(0.5, 0.9, roll + (fray - 0.5) * 0.5) * smoothstep(0.3, 0.62, rag), sharp) * env;
              lit = 0.5 + 0.5 * cos(ph * 6.2832) * sign(dot(wd, sunH));
            }
            col = mix(col, mix(uLayerShade, uMidLit, 0.3 + 0.7 * lit), c * uWaves.x * low * 0.72);
          }
          // a lenticular stack over a peak: lenses one on another, smooth, the top of each lit, its rim catching the light
          if (uLens.w > 0.01) {
            float az = atan(d.z, d.x);
            float daz = atan(sin(az - uLens.x), cos(az - uLens.x));
            float el = asin(clamp(d.y, -1.0, 1.0));
            float lens = 0.0;
            float topLit = 0.0;
            // (three lenses stacked, each a flattened ellipse with a crisp upper rim and a softer belly, a thin gap of sky
            // between them; the upper side of each lit, the belly in shade; the stack a little shorter each lens up)
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float wi = uLens.z * (1.0 - 0.2 * fi);
              float hi = uLens.z * 0.2 * (1.0 - 0.12 * fi);
              float yc = uLens.y + fi * hi * 1.7;
              float u = daz / wi;
              float v = (el - yc) / hi;
              // (flatter underneath: a lens rides on a level base)
              float vv = v < 0.0 ? v * 1.35 : v;
              float e = u * u + vv * vv;
              float l = (1.0 - smoothstep(v > 0.0 ? 0.9 : 0.7, 1.0, e)) * (1.0 - 0.1 * fi);
              if (l > lens) {
                lens = l;
                topLit = smoothstep(-0.55, 0.45, v) * (0.8 + 0.2 * (1.0 - abs(u)));
              }
            }
            vec3 lc = mix(uLayerShade, uMidLit, 0.22 + 0.78 * topLit * (0.55 + 0.45 * toSun));
            col = mix(col, lc, lens * uLens.w * 0.95);
          }
        }
        // ---- noctilucent clouds: in a cold country's summer twilight, an electric blue lacework low over the sun's
        // side of the sky, lit from below the horizon
        if (uNlc > 0.01 && d.y > 0.0) {
          vec2 sunH = normalize(uSunDisc.xz + vec2(1e-4, 0.0));
          float side = smoothstep(0.1, 0.8, dot(normalize(d.xz + 1e-5), sunH));
          vec2 pn = d.xz / (d.y + 0.05);
          // (fine bands, rippled, in patches: brightest low, gone a fifth of the way up)
          float bands = 0.5 + 0.5 * sin(pn.x * 13.0 + pn.y * 4.0 + texture2D(tNoise, pn * 0.7).r * 9.0 + uTime * 0.04);
          float lace = texture2D(tNoise, vec2(pn.x * 0.9 + uTime * 0.003, pn.y * 3.4)).g * 0.55 + bands * 0.45;
          float patchN = smoothstep(0.4, 0.62, texture2D(tNoise, pn * 0.18 + 0.3).b);
          float n = smoothstep(0.62, 0.86, lace) * patchN * side * smoothstep(0.02, 0.06, d.y) * (1.0 - smoothstep(0.1, 0.3, d.y));
          col += vec3(0.32, 0.64, 1.0) * n * uNlc * 0.55;
        }

        // ---- cumulus
        if (uCloudsOn > 0.5 && d.y > 0.0) {
          vec4 c = textureCube(tClouds, d);
          // towards the sun a cloud's edge is lit through
          c.rgb += uGlow * pow(sd, 40.0) * 0.5 * c.a * (1.0 - c.a) * 4.0 * uSunVis;
          col = col * (1.0 - c.a) + c.rgb;
        }
        // ---- the bank: a row of low heaps far off, flat underneath, lumpy on top, lit where they face the sun
        if (uBank > 0.01 && d.y > -0.01 && d.y < 0.12) {
          float az = atan(d.z, d.x);
          float there = smoothstep(0.38, 0.62, fbm(vec2(az * 1.6 + 7.0, 2.3)));
          float lumps = fbm(vec2(az * 9.0, 0.7)) * 0.65 + fbm(vec2(az * 31.0, 5.1)) * 0.35;
          float top = (0.01 + 0.085 * there * lumps * 1.3) * uBank;
          float inBank = (1.0 - smoothstep(top - 0.0015, top + 0.0015, d.y)) * step(0.004, top);
          // Each heap is lit from above — its upper part white, more of it towards the sun, the line
          // between light and shade wandering with the heap's own lumps — over a body in the pale
          // blue shade and a deeper flat base. (A lit rim of even thickness read as a white outline
          // drawn along a far mountain range.) So far off, the air has taken a good part of it.
          float sunSide = dot(normalize(d.xz + 1e-4), normalize(uSunDisc.xz + 1e-4)) * 0.5 + 0.5;
          float up = d.y / max(top, 1e-4);
          float edge = mix(0.74, 0.4, sunSide) + 0.3 * (fbm(vec2(az * 23.0 + 1.7, 3.3)) - 0.5);
          float lit = smoothstep(edge - 0.03, edge + 0.03, up);
          vec3 bank = mix(uBankShade, uBankLit, lit);
          bank = mix(mix(uBankShade, uHorizon, 0.35), bank, smoothstep(0.0, 0.006, d.y));
          col = mix(col, mix(bank, uHorizon, 0.3), inBank);
        }
        // ---- an overcast deck: one soft sheet with darker bellies. Weather brings its own: a front that
        // comes on from where the storm stands, a ragged shelf with a pale lip, dark behind it, rain hanging under
        if ((uDeck.x > 0.01 || uStorm.z > 0.002) && d.y > -0.02) {
          vec2 pl = d.xz / (d.y + 0.15);
          vec2 uv = pl * 0.6 + uDeck.zw;
          float n = fbm(uv) * 0.7 + fbm(uv * 2.6 + 3.0) * 0.3;
          float belly = floor(smoothstep(0.35, 0.72, n) * 2.0 + 0.5) / 2.0;
          vec3 deck = mix(uDeckLit, uDeckShade, belly * 0.8 + uDeck.y * 0.3);
          float cover = smoothstep(0.0, 0.1, d.y + 0.02) * uDeck.x;
          float hazeAmt = smoothstep(0.25, 0.0, d.y) * 0.6;
          if (uStorm.z > 0.002) {
            float along = dot(pl, uStorm.xy);
            float edge = mix(7.6, -7.6, uStorm.z) + (n - 0.5) * 2.4 + (fbm(pl * 0.35 + 5.0) - 0.5) * 2.0;
            float inFront = smoothstep(edge - 0.35, edge + 0.3, along) * smoothstep(-0.01, 0.035, d.y);
            float deep = smoothstep(edge, edge + 4.5, along);
            vec3 body = mix(deck, uDeckShade * 0.58, deep * 0.85);
            body = mix(body, uDeckLit * 1.08, (1.0 - smoothstep(0.0, 0.8, along - edge)) * 0.55);
            // Far off the weather stands as a wall: a dark mass heaped on the horizon where it is coming
            // from, lumpy on top, its rim catching the light — long before the shelf reaches overhead
            vec2 hd = normalize(d.xz + 1e-5);
            float toward = dot(hd, uStorm.xy);
            float az = atan(d.z, d.x);
            float lump = fbm(vec2(az * 5.0 + 1.3, 0.7)) * 0.6 + fbm(vec2(az * 17.0, 4.1)) * 0.4;
            float yTop = (0.035 + 0.55 * uStorm.z) * smoothstep(-0.15, 0.6, toward) * (0.65 + 0.7 * lump);
            float inWall = (1.0 - smoothstep(yTop - 0.014, yTop + 0.004, d.y)) * step(0.006, yTop) * smoothstep(-0.02, 0.008, d.y);
            float upW = clamp(d.y / max(yTop, 1e-3), 0.0, 1.0);
            vec3 wall = mix(uDeckShade * 0.5, uDeckShade * 0.86, smoothstep(0.15, 0.9, upW));
            wall = mix(wall, uDeckLit * 1.1, smoothstep(0.84, 0.97, upW) * 0.75);
            body = mix(wall, body, inFront);
            float shelf = max(inFront, inWall);
            // rain hanging under the body of it: a dark curtain to the ground, a little paler in slanting streaks
            float streaks = smoothstep(0.46, 0.7, fbm(vec2(az * 13.0 + d.y * 9.0, 2.0 + uDeck.z)));
            float under = max(deep, inWall * smoothstep(0.1, 0.5, uStorm.z)) * (1.0 - smoothstep(0.02, 0.2, d.y)) * smoothstep(0.0, 0.5, toward + 0.2);
            body = mix(body, uDeckShade * (0.5 + 0.2 * streaks), under * (0.35 + 0.65 * uStorm.w));
            deck = mix(deck, body, shelf);
            cover = max(cover, shelf);
            // (the horizon's haze does not brighten the storm's own foot)
            hazeAmt *= 1.0 - 0.85 * shelf * smoothstep(-0.2, 0.3, toward);
          }
          col = mix(col, mix(deck, uHorizon, hazeAmt), cover);
        }
        // ---- lightning: a drawn bolt, a trunk that wanders down from the cloud and one branch
        if (uBolt.w > 0.01) {
          vec2 hd = normalize(d.xz + 1e-5);
          float facing = dot(hd, uBolt.xy);
          if (facing > 0.5) {
            float x = dot(hd, vec2(-uBolt.y, uBolt.x));
            float y = d.y;
            float top = 0.34 + 0.1 * fract(uBolt.z * 0.37);
            float pin = smoothstep(top, top - 0.12, y);
            float path = ((vnoise(vec2(y * 11.0, uBolt.z)) - 0.5) * 0.15 + (vnoise(vec2(y * 37.0, uBolt.z + 7.0)) - 0.5) * 0.045 + (vnoise(vec2(y * 110.0, uBolt.z + 3.0)) - 0.5) * 0.014) * pin;
            float dx = abs(x - path);
            float inSpan = step(y, top) * step(-0.01, y);
            float core = (1.0 - smoothstep(0.0009, 0.0026, dx)) * inSpan;
            // the branch leaves the trunk part of the way down and runs off to one side, thinner
            float y0 = top * (0.45 + 0.3 * fract(uBolt.z * 1.71));
            float sideways = fract(uBolt.z * 2.93) > 0.5 ? 1.0 : -1.0;
            float bpath = path + sideways * (y0 - y) * (0.5 + 0.4 * vnoise(vec2(y * 23.0, uBolt.z + 11.0)));
            float bcore = (1.0 - smoothstep(0.0006, 0.0018, abs(x - bpath))) * step(y, y0) * step(y0 - top * 0.3, y);
            float glow = exp(-dx * dx / 0.0035) * inSpan;
            col += vec3(0.82, 0.88, 1.0) * (core * 6.0 + bcore * 3.5 + glow * 0.5) * uBolt.w;
          }
        }
        col += vec3(0.6, 0.65, 0.8) * uFlash * 0.6;

        // below the horizon the air takes over: no hard edge
        col = mix(col, uFogColor, smoothstep(0.0, -0.08, d.y));
        gl_FragColor = vec4(col, 0.25);
      }`,
  });
}
