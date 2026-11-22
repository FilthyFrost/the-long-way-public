/**
 * Water as a painter lays it in (specs/art/STYLE.md §6.2): a few flat tones by depth, the sky lying
 * on it in broken horizontal strokes, hard little dabs of light where the sun glitters, thin pale
 * lines where the surface moves. No physical waves.
 *
 * Geometry (scene/waterBuild.ts): a flat sheet at the water level; aWater = (depth of the bed below
 * the surface in metres, distance along a river in metres, position across it −1…1, frozen 0…1).
 * The shoreline itself is drawn by the ground shader, which knows exactly where the land meets
 * the level; this sheet fades out to nothing in the last hand's depth so the two never disagree.
 */
import * as THREE from 'three';
import { GLSL_SKY_MIRROR, skyMirrorUniforms } from '../env/sky';
import { GLSL_MIRROR, mirrorUniforms } from './mirror';
import { maskPreservingBlend } from './materials';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_PARS, globals } from './shaderlib';
import { STYLE } from './style';

const v3 = (c: readonly number[]): THREE.Vector3 => new THREE.Vector3(c[0], c[1], c[2]);

/** the water paints (linear), with fallbacks so the material works before the spec carries them */
export function waterPaints(): { shallow: THREE.Vector3; mid: THREE.Vector3; deep: THREE.Vector3; ice: THREE.Vector3; iceShade: THREE.Vector3 } {
  const w = (STYLE as unknown as { water?: Record<string, number[]> }).water ?? {};
  return {
    shallow: v3(w.shallow ?? [0.2, 0.62, 0.56]),
    mid: v3(w.mid ?? [0.06, 0.36, 0.46]),
    deep: v3(w.deep ?? [0.02, 0.15, 0.3]),
    ice: v3(w.ice ?? [0.8, 0.9, 0.97]),
    iceShade: v3(w.iceShade ?? [0.42, 0.6, 0.8]),
  };
}

/** x: rain falling on the water 0…1 (set by the environment) */
export const waterUniforms = {
  uWaterRain: { value: 0 },
};

/** @param planar (G8) a great lake's: what lies on it is the mirror's picture (render/mirror.ts) where that is drawn — the rim across the water, the clouds as they are */
export function waterMaterial(planar = false): THREE.ShaderMaterial {
  const p = waterPaints();
  const mat = new THREE.ShaderMaterial({
    defines: planar ? { RT_PLANAR: '' } : {},
    uniforms: {
      ...globals,
      ...waterUniforms,
      ...skyMirrorUniforms(),
      ...(planar ? mirrorUniforms : {}),
      uShallow: { value: p.shallow },
      uWaterMid: { value: p.mid },
      uDeep: { value: p.deep },
      uIce: { value: p.ice },
      uIceShade: { value: p.iceShade },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute vec4 aWater;
      varying vec4 vWater;
      void main() {
        vWater = aWater;
        vec4 rtWorld = modelMatrix * vec4(position, 1.0);
        vPos = rtWorld.xyz;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * rtWorld;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform float uWaterRain;
      ${GLSL_SKY_MIRROR}
      #ifdef RT_PLANAR
      ${GLSL_MIRROR}
      #endif
      uniform vec3 uShallow;
      uniform vec3 uWaterMid;
      uniform vec3 uDeep;
      uniform vec3 uIce;
      uniform vec3 uIceShade;
      varying vec4 vWater;

      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float depth = vWater.x;
        float frozen = vWater.w;
        vec3 toEye = cameraPosition - vPos;
        float dist = length(toEye);
        vec3 V = toEye / max(dist, 1e-3);
        float near = 1.0 - smoothstep(60.0, 260.0, dist);

        // ---- the surface moves: two slow layers of ripples, drifting with the wind (a river's with its flow)
        vec2 drift = uWind.xy * (0.25 + 0.9 * uWind.z) * uTime;
        float isRiver = step(0.5, abs(vWater.y) + abs(vWater.z));
        vec2 q = mix(w - drift, vec2(vWater.y - uTime * 1.6, vWater.z * 9.0 + w.x * 0.15), isRiver);
        vec4 r1 = rtNoiseAt(q, 11.0);
        vec4 r2 = rtNoiseAt(q * vec2(1.0, 1.7) + vec2(uTime * 0.35, 31.0), 37.0);
        float rough = (0.05 + 0.2 * uWind.z + 0.12 * uWaterRain) * (1.0 - frozen);
        vec2 tilt = ((r1.rg - 0.5) * 0.9 + (r2.gb - 0.5) * 1.4) * rough;
        // far off the ripples flatten out: the sheet goes calm and clear towards the far shore
        tilt *= 0.35 + 0.65 * near;
        vec3 n = normalize(vec3(tilt.x, 1.0, tilt.y));

        // ---- three tones by depth, with a brushed edge between them
        float edge = (r2.r - 0.5) * 0.5 + (rtNoiseAt(w, 90.0).g - 0.5) * 0.8;
        float dd = depth + edge * (0.25 + 0.25 * depth);
        vec3 body = mix(uShallow, uWaterMid, smoothstep(0.35, 1.3, dd));
        body = mix(body, uDeep, smoothstep(1.7, 4.2, dd));
        float sh = rtShadow(vPos, vec3(0.0, 1.0, 0.0));
        vec3 col = body * rtGroundLight(sh);

        // ---- the sky lying on it: strong where the eye skims the surface, in strokes broken across the view
        float nv = max(dot(n, V), 0.0);
        float fres = 0.05 + 0.95 * pow(1.0 - nv, 4.0);
        vec3 R = reflect(-V, n);
        // long horizontal strokes: the reflection is smeared along the way the camera looks. One direction
        // for the whole frame — the line of sight of each pixel, taken against world coordinates
        // kilometres from their origin, turned the strokes into a fine hatching far off
        vec2 look = -vec2(viewMatrix[0][2], viewMatrix[2][2]);
        look = look / max(length(look), 1e-4);
        float streak = (rtNoiseAt(vec2(dot(w, vec2(look.y, -look.x)) * 0.6, dot(w, look) * 0.045) + drift * 0.2, 14.0).a - 0.5) * 0.16 * (1.0 - frozen);
        R = normalize(R + vec3(0.0, streak * (0.4 + near), 0.0));
        vec3 sky = rtSkyMirror(R);
        // far off, under the far shore, the water takes the dark of the land beyond it, in broken strokes
        float landBand = (1.0 - smoothstep(0.012, 0.042, R.y + streak * 0.5)) * (1.0 - frozen);
        vec3 landCol = mix(mix(uHereForest, uHereGround, 0.4) * rtGroundLight(0.35), uFogColor, 0.3);
        sky = mix(sky, landCol, landBand * 0.62);
        #ifdef RT_PLANAR
        // (the world itself upside down in it, leaning with the ripples and drawn out a little down the view)
        if (uMirrorOn > 0.5) sky = rtMirrorAt(vPos, tilt * vec2(0.03, 0.05) * (0.35 + 0.65 * near) + vec2(0.0, streak * 0.02));
        #endif
        // (a painter never lets the sky wash the whole sheet out: some of the water's own tone stays)
        col = mix(col, sky, min(fres, 0.8) * mix(0.92, 0.45, frozen));

        // ---- glitter: hard dabs along the sun's path, and the moon's at night
        float sparkle = rtNoiseAt(w * 1.0 + drift * 1.7, 2.6).b * 0.6 + r1.a * 0.4;
        float path = dot(R, uSunDisc) + (sparkle - 0.5) * (0.035 + 0.05 * uWind.z);
        float glit = smoothstep(0.9965, 0.9985, path) * uSunVis * sh * (1.0 - frozen * 0.7);
        // A close reflection breaks into narrow wave crests. Filter them to their
        // mean coverage in the distance, where individual facets are subpixel.
        float wave = dot(w, vec2(.81, .59)) * 165.0 + 2.8 * sin(dot(w, vec2(-.59, .81)) * 42.0) - uTime * 2.2;
        float facets = mix(smoothstep(.68, .96, cos(wave)), .16, smoothstep(.5, 2.8, fwidth(wave)));
        float broken = smoothstep(.35, .78, rtNoiseAt(w * 14. + drift, 2.6).g);
        vec3 gilt = min(uSunColor, vec3(1.25, 1.13, .91));
        col += gilt * mix(.63 * facets * broken, .14, smoothstep(3.0, 45.0, dist)) * glit;
        float mpath = dot(R, uMoonDir) + (sparkle - 0.5) * 0.04;
        col += vec3(0.35, 0.42, 0.6) * smoothstep(0.9975, 0.999, mpath) * uWeather.w * smoothstep(0.0, 0.1, uMoonDir.y) * (1.0 - uDeck.x);

        // ---- thin pale lines where the surface moves: near the shore they follow it, further out they drift.
        // Only where a line is wider than a pixel or so: far off they would turn to a hatching
        float lap = depth * 2.2 - uTime * 0.22 + (r2.a - 0.5) * 0.7;
        float fl = fwidth(lap);
        float lw = fl * 1.5 + 0.03;
        float lines = (1.0 - smoothstep(lw, lw * 2.0, abs(fract(lap) - 0.5))) * (1.0 - smoothstep(0.5, 1.5, depth)) * step(0.5, r1.b + 0.25) * (1.0 - smoothstep(0.1, 0.28, fl));
        float wl = r1.r * 3.0 + r2.g * 2.0 + dot(w, uWind.xy) * 0.045 - uTime * 0.05;
        float fw2 = fwidth(wl);
        float ww = fw2 * 1.5 + 0.012;
        lines = max(lines, (1.0 - smoothstep(ww, ww * 2.0, abs(fract(wl) - 0.5))) * step(0.62, r2.b) * (0.25 + 0.75 * uWind.z) * near * (1.0 - smoothstep(0.07, 0.2, fw2)));
        col = mix(col, uSunColor * 0.42 + uSkyColor * 0.9, lines * 0.55 * (1.0 - frozen));

        // ---- rain: rings where the drops land
        if (uWaterRain > 0.02 && frozen < 0.5) {
          vec2 cell = floor(w / 0.7);
          vec2 f = fract(w / 0.7) - 0.5;
          float hsh = rtHash(cell + 3.3);
          float ph = fract(uTime * (0.9 + hsh) + hsh * 7.0);
          float there = step(hsh, uWaterRain * 0.9);
          float ring = (1.0 - smoothstep(0.02, 0.05, abs(length(f - (vec2(rtHash(cell), rtHash(cell + 9.1)) - 0.5) * 0.4) - ph * 0.42))) * (1.0 - ph) * there;
          // (rings smaller than a pixel would only be a stipple: they fade out before that)
          col = mix(col, sky * 1.25 + 0.05, ring * 0.6 * near * (1.0 - smoothstep(0.12, 0.35, fwidth(w.x) + fwidth(w.y))));
        }

        // ---- ice: a pale sheet, blue where it is clear, with old snow blown over it and a few long cracks
        if (frozen > 0.01) {
          // (mostly swept clear by the wind: blue ice with drifts of snow across it, or it reads as one more snowfield)
          float snowy = smoothstep(0.56, 0.7, rtNoiseAt(w, 46.0).r + (rtNoiseAt(w, 9.0).g - 0.5) * 0.3);
          vec3 ice = mix(uIceShade, uIce, snowy) * rtGroundLight(sh);
          vec2 cq = w / 23.0 + rtNoiseAt(w, 70.0).rg * 2.0;
          vec2 ce = abs(fract(cq) - 0.5);
          float crack = (1.0 - smoothstep(0.0, 0.035, min(ce.x, ce.y))) * (1.0 - snowy) * near;
          ice = mix(ice, uIceShade * rtGroundLight(sh) * 0.7, crack * 0.6);
          ice = mix(ice, sky, fres * 0.35 * (1.0 - snowy));
          col = mix(col, ice, frozen);
        }

        col += rtHeadlight(body, n, vPos) * 0.6;
        col = rtFog(col, vPos, cameraPosition);
        // clear in the shallows, closing with depth and with the glance of the eye; nothing at the very edge
        float alpha = clamp(smoothstep(0.02, 0.5, depth) * 0.62 + smoothstep(0.3, 2.5, depth) * 0.26 + fres * 0.5 + glit, 0.0, 0.97);
        alpha = mix(alpha, 1.0, frozen) * smoothstep(0.0, 0.07, depth);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  maskPreservingBlend(mat);
  return mat;
}
