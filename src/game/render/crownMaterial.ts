/**
 * The material of the painted crowns (scene/crowns/grow.ts grows them, scene/crowns/crownView.ts sets them out):
 * Painted Valley's way of painting a tree (src/valley/trees.js, Copyright (c) 2026 Patch, MIT licence: see
 * THIRD-PARTY-NOTICES.md) in the game's light and paints.
 *
 *   A spray is lit as its clump's ball is: light on the side the sun is, deep on the other, the inside and the
 *   underside of the crown deeper still; each spray a shade of its own, as brush marks are, and from far off the
 *   brush gets broader (a crown is its lobes, not its leaves). Seen against the sun, leaves glow.
 *   A clump's core is no solid but a shell of leaves cut from the same sprays, a tone deeper.
 *   The wood is bark in long strokes, mossy where it faces up or away from the sun.
 *
 * The four tones come from the region's woods (render/paint.ts rtWoodTone) or from the plant's own colour, as
 * every other plant of the game is painted (render/floraMaterial.ts): autumn country turns them, snow lies on
 * the boughs of snow country, cast shadows and cloud shadows darken them, the fog takes them.
 *
 * Per instance (InstancedMesh): instanceMatrix, and
 *   aLook  the palette slots (a + 4 b) + 1/4 of the settled snow; the share of the second + 2 if it bears + 4 if evergreen; its first
 *          colour (0xRRGGBB, −1: the region's); its second (its bark's, where it paints the bark)
 *   aTree  its own number 0 … 1; how much it sways; 1 if its bark is its second colour; the height the model
 *          is scaled by (m to a metre of the model, for the wind)
 *
 * Alpha 0.85 on the crown: the paint finish paints it with its broader brush in the middle distance, as Painted
 * Valley paints its trees (render/frame.ts: below 0.8 it would keep to the finest, and the sprays would stay
 * so many dabs): a crown reads as a few lit and shaded masses.
 */
import { PACKED_SNOW } from './seasonalSnow';
import * as THREE from 'three';
import { IMPOSTOR_VERTEX, IMPOSTOR_FRAGMENT } from './crownImpostor';
import { GLSL_LEAF_COVER } from './materials';
import { GLSL_PAINT, GLSL_SLOTS } from './paint';
import { GLSL_COMMON, globals } from './shaderlib';
import { sharedTextures } from './textures';

/** GLSL: four tones of one colour (as render/floraMaterial.ts paints a plant with a colour of its own) */
const GLSL_TINT_TONE = /* glsl */ `
  vec3 rtTintTone(vec3 t, float tone) {
    float m = max(max(t.r, t.g), max(t.b, 1e-3));
    vec3 tn = t / m;
    float sat = 1.0 - min(min(tn.r, tn.g), tn.b);
    vec3 cool = vec3(0.0, 0.0, (0.35 + 0.85 * sat) * (1.0 - 0.7 * max(tn.r - tn.g, 0.0)));
    vec3 f0 = m * (0.16 * pow(tn, vec3(2.5)) + 0.14 * cool);
    vec3 f1 = m * (0.34 * pow(tn, vec3(2.2)) + 0.16 * cool);
    vec3 f2 = m * (0.61 * pow(tn, vec3(1.5)) + 0.1 * cool);
    vec3 c = mix(f0, f1, smoothstep(0.26, 0.4, tone));
    c = mix(c, f2, smoothstep(0.52, 0.66, tone));
    return mix(c, t, smoothstep(0.8, 0.92, tone));
  }
`;

export function crownMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals, tLeaf: { value: sharedTextures().leaf } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float logDepthBufFC;
      uniform vec4 uWind;
      ${PACKED_SNOW}
      uniform float uTime;
      uniform float uCrownDay;
      attribute vec4 aCrown;   // tone, its clump's phase, how open it lies, its height in the tree (model m)
      attribute float aPart;   // 0 wood, 1 a clump's core, 2 a spray
      attribute vec3 aFade;
      varying vec2 vFade;
      ${IMPOSTOR_VERTEX}
      attribute vec4 aLook;
      attribute vec4 aTree;
      ${GLSL_SLOTS}
      varying vec3 vGeomPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec4 vGeomCrown;
      varying float vGeomPart;
      varying vec4 vBw;
      varying vec4 vTint;
      varying vec3 vTint2;
      varying float vEver;
      varying float vSettled;
      varying float vVar;
      varying float vBark;
      vec3 rtHexColour(float h) {
        vec3 s = vec3(floor(h / 65536.0), mod(floor(h / 256.0), 256.0), mod(h, 256.0)) / 255.0;
        return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s));
      }
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        vec4 w = m * vec4(position, 1.0);
        vec3 n = normalize(mat3(m) * normal);
        vec3 root = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float range = distance(cameraPosition, root + vec3(0.0, aFade.y, 0.0));
        vFade = vec2(sign(aFade.x), smoothstep(abs(aFade.x) - aFade.z, abs(aFade.x) + aFade.z, range));
        #ifdef CROWN_ATLAS
          projectCard(m, w);
        #else
        // the wind: the crown rides the gusts with a slow lean, each clump a little in its own time, each spray trembling
        float U = uWind.z;
        float h = aCrown.w * aTree.w;
        float high = smoothstep(1.0, 9.0, h);
        float ph = uTime * (0.9 + 1.6 * U) + root.x * 0.37 + root.z * 0.29;
        vec2 wd = normalize(uWind.xy + vec2(1e-4, 0.0));
        float bend = (0.12 + U) * h * h * 0.0045 * aTree.y;
        float own = sin(ph + aCrown.y * 6.2831) * 0.25;
        w.xz += wd * bend * (0.55 + 0.45 * sin(ph) + own) + vec2(-wd.y, wd.x) * bend * 0.35 * cos(ph * 0.8 + 1.3 + aCrown.y * 3.0);
        if (aPart > 1.5 && aPart < 2.5) w.xyz += n * sin(uTime * (2.6 + 2.0 * aCrown.x) + aCrown.x * 61.0) * 0.025 * (0.25 + U) * high * aTree.y;
        #endif
        vGeomPos = w.xyz;
        vNormal = n;
        vUv = uv;
        vGeomCrown = aCrown;
        vGeomPart = aPart;
        vVar = aTree.x;
        vBark = aTree.z;
        float flags = floor(aLook.y * 0.5);
        vEver = floor(flags * 0.5);
        // Day zero is early June in the northern road references. Ash leafs out late;
        // from early spring until May its sparse sprays open progressively.
        float year = mod(uCrownDay + 151.0, 365.0);
        bool ash = abs(aPart-1.24)<0.01 || abs(aPart-2.24)<0.01;
        if (ash && year>60.0 && year<140.0 && aCrown.x>smoothstep(105.0,140.0,year))
          w = m * vec4(0.0,0.0,0.0,1.0);
        if (aPart>6.5 && (year<124.0 || year>172.0 || aTree.x>0.64))
          w = m * vec4(0.0,0.0,0.0,1.0);
        vSettled = rtRootSnow(aLook.x);
        if (aPart > 3.5 && aPart < 4.5 && mod(flags, 2.0) < 0.5) w = m * vec4(0.0, 0.0, 0.0, 1.0);
        vBw = rtSlotPair(aLook.x, aLook.y - 2.0 * flags);
        vTint = aLook.z < 0.0 ? vec4(0.0, 0.0, 0.0, -1.0) : vec4(rtHexColour(aLook.z), 1.0);
        vTint2 = rtHexColour(max(aLook.w, 0.0));
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
        #if defined(USE_LOGARITHMIC_DEPTH_BUFFER) && !defined(CROWN_ATLAS)
          gl_Position.z = (log2(max(1e-6, gl_Position.w + 1.0)) * logDepthBufFC - 1.0) * gl_Position.w;
        #endif
        if ((vFade.x < 0.0 && vFade.y >= 1.0) || (vFade.x > 0.0 && vFade.y <= 0.0)) {
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      ${GLSL_LEAF_COVER}
      ${GLSL_TINT_TONE}
      ${IMPOSTOR_FRAGMENT}
      varying vec2 vFade;
      uniform sampler2D tLeaf;
      varying vec3 vGeomPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec4 vGeomCrown;
      varying float vGeomPart;
      varying vec4 vBw;
      varying vec4 vTint;
      varying vec3 vTint2;
      varying float vEver;
      varying float vSettled;
      varying float vVar;
      varying float vBark;
      // the four tones of a crown: its own colour's, or its region's woods (turned in autumn country)
      vec3 crownTone(RtPal p, float tone) {
        if (vTint.w > 0.0) return rtTintTone(vTint.rgb, tone);
        vec3 c = rtWoodTone(p, tone);
        if (p.variety > 0.01) {
          if (vEver > 0.5) {
            c = mix(c, mix(vec3(0.012, 0.07, 0.06), vec3(0.08, 0.26, 0.12), smoothstep(0.25, 0.85, tone)), p.variety);
          } else {
            vec3 stillGreen = mix(vec3(0.03, 0.13, 0.05), vec3(0.2, 0.42, 0.1), smoothstep(0.2, 0.8, tone));
            vec3 gold = mix(vec3(0.5, 0.26, 0.03), vec3(0.95, 0.72, 0.12), smoothstep(0.25, 0.85, tone));
            c = mix(c, stillGreen, p.variety * step(vVar, 0.16) * 0.9);
            c = mix(c, gold, p.variety * smoothstep(0.76, 0.8, vVar) * 0.85);
          }
        }
        return c;
      }
      void main() {
        #ifdef CROWN_ATLAS
          #include <logdepthbuf_fragment>
        #endif
        if (vFade.x != 0.0) {
          float rank = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
          if ((rank < vFade.y) != (vFade.x > 0.0)) discard;
        }
        vec3 vPos = vGeomPos, n = normalize(vNormal);
        vec4 vCrown = vGeomCrown;
        float vPart = vGeomPart;
        #ifdef CROWN_ATLAS
          readCard(vUv, vEver < 0.5 && max(vSettled, uWeather.y) > 0.5 + 0.18 * vVar, vPos, n, vCrown, vPart);
          #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
            gl_FragDepth = log2(1.0 - (viewMatrix * vec4(vPos, 1.0)).z) * logDepthBufFC * 0.5;
          #endif
        #endif
        if (vPart < 0.5 && !gl_FrontFacing) n = -n;
        vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z));
        vec3 V = normalize(cameraPosition - vPos);
        float dist = length(cameraPosition - vPos);
        vec3 col;
        vec3 albedo;
        float load = max(vSettled, uWeather.y);
        float alpha = 0.85;
        // (a deciduous tree's leaves gone under the snow; the solid parts — palm blades, cactus ribs, fruit — stay)
        if (vPart > 0.5 && vPart < 2.5 && vEver < 0.5 && load > 0.5 + 0.18 * vVar) discard;
        if (vPart > 2.5) {
          // Folded blades and fleshy cactus ribs already have a silhouette in the geometry.
          RtPal p = rtPal(vBw);
          float tone = clamp(0.54 + dot(n, L)*0.29 + (vCrown.x - 0.5)*0.38, 0.0, 1.0);
          albedo = vPart > 3.5 ? rtTintTone(vTint2, tone) : crownTone(p, tone);
          if (vPart > 4.5) albedo = rtTintTone(vPart < 5.5 ? vec3(0.86,0.055,0.025) : vec3(0.35,0.19,0.067), tone);
          if (vPart > 6.5) albedo = mix(vec3(0.61,0.55,0.31),vec3(0.98,0.96,0.82),tone);
          albedo = mix(albedo, rtSnowTone(tone), smoothstep(0.25, 0.8, n.y)*load*0.8);
          col = albedo * (uSkyColor*0.86 + uBounceColor*0.38 + uSunColor*(0.17+0.25*tone)*rtShadow(vPos,n));
          alpha = 1.0;
        } else if (vPart > 1.5) {
          // a spray: its picture, kept whole far off as it blurs (the cut falls with distance)
          float leafTone = 0.75;
          #ifndef CROWN_ATLAS
          float cover = rtLeafCover(tLeaf, vUv, leafTone);
          if (vPart > 2.05) {
            vec2 uv = vUv*2.0-1.0;
            if (vPart < 2.18) {
              // Each brush stamp has three cordate leaves above a tapering point.
              vec2 q = fract(vUv*2.0)*2.0-1.0;
              float halfWidth = (0.18+0.86*(q.y*0.5+0.5))*sqrt(max(0.0,1.0-q.y*q.y));
              cover *= step(abs(q.x),halfWidth) * step(q.y,0.99-0.22*exp(-q.x*q.x*38.0));
            } else {
              float leaflets = fract((uv.y-abs(uv.x)*0.52)*3.0);
              cover *= max(1.0-smoothstep(0.42,0.52,leaflets),1.0-smoothstep(0.025,0.055,abs(uv.x)));
            }
          }
          if (cover < mix(0.5, 0.26, smoothstep(20.0, 120.0, dist))) discard;
          #endif
          RtPal p = rtPal(vBw);
          float sh = rtShadow(vPos, n);
          // lit as the ball it is part of; a shade of its own; the brush broader far off
          float fine = mix(1.0, 0.3, smoothstep(14.0, 110.0, dist));
          float tone = (dot(n, L) * 0.5 + 0.5) * mix(0.5, 1.0, vCrown.z);
          tone += ((vCrown.x - 0.5) * 0.36 + (leafTone - 0.76) * 0.5) * fine;
          tone -= (1.0 - sh) * 0.3;
          albedo = crownTone(p, tone);
          float snow = smoothstep(0.25, 0.7, n.y + (vCrown.x - 0.5) * 0.5) * load;
          albedo = mix(albedo, rtSnowTone(tone), snow);
          vec3 light = uSkyColor * 0.9 + uBounceColor * 0.4 + uSunColor * (0.16 + 0.2 * smoothstep(0.5, 0.9, tone)) * sh;
          col = albedo * light;
          // seen against the sun, leaves glow
          float through = pow(max(dot(-V, uSunDir), 0.0), 2.0);
          col += vec3(0.3, 0.5, 0.05) * uSunColor * through * (0.04 + 0.2 * vCrown.x * vCrown.x) * sh;
        } else if (vPart > 0.5) {
          // a clump's core: a shell of leaves cut from the same sprays, that one sees into; a tone deeper
          #ifndef CROWN_ATLAS
          vec3 a = abs(n);
          vec2 uv = a.y > max(a.x, a.z) ? n.xz : a.x > a.z ? n.zy : n.xy;
          if (texture2D(tLeaf, uv * 2.3 + vCrown.y * 7.0).g < 0.4) discard;
          if (!gl_FrontFacing) n = -n;
          #endif
          RtPal p = rtPal(vBw);
          float sh = rtShadow(vPos, n);
          float grain = texture2D(tNoise, rtWorldXZ(vPos) * 0.9 / 64.0 + vPos.y * 0.0058).r;
          float tone = (dot(n, L) * 0.5 + 0.5) * mix(0.5, 1.0, vCrown.z) + (grain - 0.5) * 0.36 - 0.06 - (1.0 - sh) * 0.25;
          albedo = crownTone(p, min(tone, 0.7));
          float snow = smoothstep(0.3, 0.8, n.y) * (load * 0.88);
          albedo = mix(albedo, rtSnowTone(tone), snow);
          col = albedo * (uSkyColor * 0.9 + uBounceColor * 0.4 + uSunColor * (0.16 + 0.12 * smoothstep(0.5, 0.9, tone)) * sh);
        } else {
          // the wood: bark in long strokes, greyer in places, green with moss where it faces up or away from the sun
          float stroke = texture2D(tNoise, vec2(vUv.x * 3.0, vUv.y * 0.16)).r;
          float patchy = texture2D(tNoise, vec2(vUv.x * 0.9 + 0.3, vUv.y * 0.07)).g;
          vec3 bark = mix(vec3(0.085, 0.062, 0.05), vec3(0.2, 0.16, 0.125), smoothstep(0.3, 0.7, stroke));
          bark = mix(bark, vec3(0.24, 0.23, 0.2), smoothstep(0.55, 0.75, patchy) * 0.6);
          if (vBark > 0.5) {
            // a pale bark (a birch's): the plant's second colour, with dark marks across it
            float mark = smoothstep(0.62, 0.72, texture2D(tNoise, vec2(vUv.x * 1.3, vUv.y * 1.7)).b);
            bark = mix(vTint2 * mix(0.75, 1.0, stroke), vec3(0.05, 0.045, 0.045), mark * mix(0.20, 0.85, smoothstep(0.58, 0.76, vTint2.r)));
          }
          float moss = smoothstep(0.45, 0.7, patchy * 0.6 + n.y * 0.5 - dot(n, uSunDir) * 0.2 + 0.25) * 0.75 * (1.0 - vBark * 0.7);
          albedo = mix(bark, vec3(0.06, 0.13, 0.035), moss * (1.0 - load));
          albedo = mix(albedo, rtSnowTone(0.65), load * smoothstep(0.18, 0.72, n.y));
          float sh = rtShadow(vPos, n);
          float sun = smoothstep(-0.15, 0.6, dot(n, uSunDir)) * sh;
          col = albedo * (uSunColor * sun * 0.62 + mix(uBounceColor * 2.0, uSkyColor, n.y * 0.5 + 0.5) * 0.85);
          alpha = 1.0;
        }
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}
