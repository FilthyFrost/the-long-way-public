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
  uAurora: { value: 0 },
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
      uniform float uAurora;
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

      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.3, pow(h, 0.8)));
        col = mix(col, uZenith, smoothstep(0.18, 0.85, h));

        // ---- night: stars and a soft band of milky way, aurora low in the sky
        if (uStars > 0.01 && d.y > -0.02) {
          vec3 q = d * 190.0;
          vec3 cell = floor(q);
          float hs = h31(cell);
          vec3 f = fract(q) - 0.5;
          float star = step(0.9962, hs) * smoothstep(0.38, 0.0, length(f)) * (0.5 + 1.5 * fract(hs * 91.7));
          star *= 0.75 + 0.25 * sin(uTime * (1.5 + 3.0 * fract(hs * 17.3)) + hs * 40.0);
          float band = exp(-pow(dot(d, normalize(vec3(0.35, 0.5, -0.8))) * 3.2, 2.0));
          float dustn = fbm(d.xz * 5.0 + d.y * 3.0);
          vec3 mw = vec3(0.1, 0.12, 0.2) * band * (0.35 + 0.9 * dustn);
          col += (vec3(0.5, 0.55, 0.7) * star + mw) * uStars * smoothstep(-0.02, 0.2, d.y);
        }
        if (uAurora > 0.01) {
          float az = atan(d.z, d.x);
          float wave = fbm(vec2(az * 2.2 + uTime * 0.02, uTime * 0.015));
          float curtain = smoothstep(0.38, 0.75, fbm(vec2(az * 9.0 + wave * 4.0, uTime * 0.03)));
          float bandA = smoothstep(0.08, 0.2, d.y) * (1.0 - smoothstep(0.32, 0.7, d.y + (wave - 0.5) * 0.25));
          float rays = 0.6 + 0.4 * vnoise(vec2(az * 60.0, uTime * 0.2));
          vec3 ac = mix(vec3(0.05, 0.42, 0.22), vec3(0.2, 0.1, 0.4), smoothstep(0.2, 0.6, d.y));
          col += ac * curtain * bandA * rays * uAurora * smoothstep(-0.2, 0.5, -d.z);
        }

        // ---- the sun: three glows and a disc bright enough to bloom
        float sd = max(dot(d, uSunDisc), 0.0);
        col += uGlow * (pow(sd, 6.0) * 0.05 + pow(sd, 90.0) * 0.3 + pow(sd, 1400.0) * 1.4) * uSunVis;
        col += uDisc * smoothstep(0.99988, 0.99996, sd) * 8.0 * uSunVis;
        // ---- the moon
        float md = max(dot(d, uMoonDir), 0.0);
        float moon = smoothstep(0.99975, 0.99988, md) * smoothstep(0.0, 0.05, uMoonDir.y);
        col += vec3(0.12, 0.15, 0.24) * pow(md, 90.0) * uStars;
        col = mix(col, vec3(0.9, 0.92, 1.0) * (0.6 + 0.4 * vnoise(d.xy * 260.0)), moon);

        // ---- rainbow, opposite the sun
        if (uRainbow > 0.01) {
          float ang = degrees(acos(clamp(dot(d, -uSunDisc), -1.0, 1.0)));
          float bandR = smoothstep(39.6, 40.4, ang) * (1.0 - smoothstep(42.0, 42.8, ang));
          col += spectrum(1.0 - (ang - 39.8) / 2.8) * bandR * uRainbow * 0.32 * smoothstep(0.0, 0.12, d.y);
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
