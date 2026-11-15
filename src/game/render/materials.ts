/**
 * Material factories. Everything in the world uses these few shaders so the look stays coherent
 * (render style v2, specs/art/STYLE.md §2.3):
 *   surfaceMaterial  cel: a lit tone and a sky-lit shade tone (vehicles, props, buildings, poles)
 *   foliageMaterial  clumps: a biome's four greens chosen by how a ball of leaves faces the light
 *   rockMaterial     faceted rock in the biome's two rock paints
 *   grassMaterial    blades in the ground paint of the spot they grow from
 */
import * as THREE from 'three';
import { GLSL_PAINT, GLSL_SLOTS } from './paint';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from './shaderlib';
import { sharedTextures } from './textures';

/** GLSL: coverage of a leaf card at uv, kept up as the texture shrinks (else far crowns go bald) */
export const GLSL_LEAF_COVER = /* glsl */ `
  float rtLeafCover(sampler2D tex, vec2 uv, out float tone) {
    vec4 t = texture2D(tex, uv);
    vec2 dx = dFdx(uv * 256.0);
    vec2 dy = dFdy(uv * 256.0);
    float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1.0));
    tone = t.r;
    return t.g * (1.0 + lod * 0.32);
  }
`;

export interface SurfaceOptions {
  /** base colour; multiplies vertex / instance colours */
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  /** faceted look: normals from screen-space derivatives */
  flat?: boolean;
  emissive?: THREE.ColorRepresentation;
  emissiveIntensity?: number;
  /** strength of the broad stylised highlight, 0..1 */
  spec?: number;
  side?: THREE.Side;
  opacity?: number;
  /** colour map (sRGB). With `mapEmissive` it is drawn self-lit (gauges, signs at night). */
  map?: THREE.Texture;
  mapEmissive?: number;
  fog?: boolean;
  /** vegetation: bends with the wind, more towards the top (1 = a tree) */
  sway?: number;
  /** snow settles on upward faces: permanent amount 0…1 (weather snow is added on top); undefined = never */
  snowCap?: number;
  /**
   * Brushwork in the plane of each face (walls: along the wall and up it; floors and roofs: on the
   * plan), strongest near the eye and gone by 150 m: the buildings by the road are painted with the
   * same brush as the ground they stand on. 0…1.
   */
  brush?: number;
  /**
   * Inked like a cel drawing (STYLE.md §4): the surface writes a small alpha of its own, different
   * for each colour, and the frame pass draws a dark warm line wherever two of them meet or one
   * meets the world. Inked surfaces are left out of the paint finish. Opaque surfaces only.
   */
  ink?: boolean;
  /**
   * Inside a closed vehicle: less of the sky reaches it (and what does is warmed by the lining),
   * the sun only where the shadow maps let it in, and the cabin lamp lights it at night
   * (uCabinAmb / uCabinLamp, set by the vehicle view).
   */
  cabin?: boolean;
}

/** keep the mask in alpha untouched when blending transparent surfaces */
export function maskPreservingBlend(mat: THREE.Material): void {
  mat.transparent = true;
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.SrcAlphaFactor;
  mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor;
  mat.blendDstAlpha = THREE.OneFactor;
  mat.depthWrite = false;
}

/** General lit, matte surface: vehicles, props, buildings. */
export function surfaceMaterial(o: SurfaceOptions = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.flat) defines.RT_FLAT = '';
  if (o.map) defines.RT_MAP = '';
  if (o.side === THREE.DoubleSide) defines.RT_DOUBLE = '';
  if (o.fog === false) defines.RT_NOFOG = '';
  if (o.sway) defines.RT_SWAY = '';
  if (o.snowCap !== undefined) defines.RT_SNOW = '';
  if (o.ink && (o.opacity ?? 1) >= 1) defines.RT_INK = '';
  if (o.cabin) defines.RT_CABIN = '';
  if (o.brush) defines.RT_BRUSH = '';
  const mat = new THREE.ShaderMaterial({
    defines,
    vertexColors: o.vertexColors ?? false,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      ...globals,
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uEmissive: { value: new THREE.Color(o.emissive ?? 0x000000).multiplyScalar(o.emissiveIntensity ?? 1) },
      uSpec: { value: o.spec ?? 0 },
      uOpacity: { value: o.opacity ?? 1 },
      uMap: { value: o.map ?? null },
      uMapEmissive: { value: o.mapEmissive ?? 0 },
      uSway: { value: o.sway ?? 0 },
      uSnowCap: { value: o.snowCap ?? 0 },
      uBrush: { value: o.brush ?? 0 },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      #ifdef RT_SWAY
      uniform vec4 uWind;
      uniform float uTime;
      uniform float uSway;
      #endif
      #ifdef RT_MAP
      varying vec2 vUv;
      #endif
      #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
      varying vec3 vColor;
      #endif
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        #ifdef RT_MAP
        vUv = uv;
        #endif
        #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
        vColor = vec3(1.0);
        #endif
        #ifdef USE_COLOR
        vColor *= color;
        #endif
        #ifdef USE_INSTANCING_COLOR
        vColor *= instanceColor;
        #endif
        #ifdef RT_SWAY
        {
          #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          #else
          vec3 ip = vec3(0.0);
          #endif
          // a slow lean with the wind plus a quicker flutter; each plant has its own phase
          float ph = uTime * (0.9 + 1.6 * uWind.z) + ip.x * 0.37 + ip.z * 0.29;
          float bend = uSway * (0.12 + uWind.z) * position.y * position.y * 0.011;
          transformed.x += (sin(ph) * 0.6 + 0.4 * uWind.z * 2.0) * bend;
          transformed.z += cos(ph * 0.8 + 1.3) * 0.5 * bend;
        }
        #endif
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uColor;
      uniform vec3 uEmissive;
      uniform float uSpec;
      uniform float uOpacity;
      uniform float uMapEmissive;
      uniform float uSnowCap;
      uniform float uBrush;
      #ifdef RT_MAP
      uniform sampler2D uMap;
      varying vec2 vUv;
      #endif
      #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
      varying vec3 vColor;
      #endif
      void main() {
        #include <logdepthbuf_fragment>
        #ifdef RT_FLAT
        vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
        #else
        vec3 n = normalize(vNormal);
        #ifdef RT_DOUBLE
        if (!gl_FrontFacing) n = -n;
        #endif
        #endif
        vec3 albedo = uColor;
        #if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)
        albedo *= vColor;
        #endif
        vec3 glow = uEmissive;
        float alpha = uOpacity;
        #ifdef RT_MAP
        vec4 tex = texture2D(uMap, vUv);
        albedo *= tex.rgb;
        glow += tex.rgb * uMapEmissive;
        alpha *= tex.a;
        #endif
        #ifdef RT_BRUSH
        {
          // strokes a hand long and strokes an arm long, laid in the plane of the face
          vec2 bw = rtWorldXZ(vPos);
          float by = rtWorldY(vPos);
          // (a wall stands at any angle to the world's axes: its own horizontal direction, not the nearer axis —
          // choosing between x and z flickered from pixel to pixel on walls near 45°)
          vec2 bq = bw;
          if (abs(n.y) < 0.6) bq = vec2(dot(vPos.xz, normalize(vec2(-n.z, n.x))), by);
          float bd = length(vPos - cameraPosition);
          float marks = (rtStrokeAt(bq, 1.3) - 0.5) * (1.0 - smoothstep(18.0, 50.0, bd)) + (rtStrokeAt(bq + 7.3, 5.0) - 0.5) * 0.8 * (1.0 - smoothstep(60.0, 150.0, bd));
          // (and a slow drift of tone across the whole wall, as when the paint was thinned)
          marks += (rtNoiseAt(bq + 3.1, 14.0).g - 0.5) * 0.5;
          albedo *= 1.0 + uBrush * marks * 0.55;
        }
        #endif
        #ifdef RT_SNOW
        albedo = mix(albedo, vec3(0.88, 0.92, 0.97), smoothstep(0.18, 0.6, n.y) * max(uSnowCap, uWeather.y * 0.85));
        #endif
        float sh = rtShadow(vPos, n);
        #ifdef RT_CABIN
        // without shadow maps nothing keeps the sun out of the room: let a third of it in
        sh *= mix(0.35, 1.0, uShadowParams.x);
        vec3 col = rtCabin(albedo, n, sh);
        #else
        vec3 col = rtCel(albedo, n, sh);
        #endif
        vec3 v = normalize(cameraPosition - vPos);
        vec3 hv = normalize(v + uSunDir);
        col += uSunColor * uSpec * 0.6 * smoothstep(0.88, 0.97, dot(n, hv)) * step(0.0, dot(n, uSunDir)) * sh;
        #ifndef RT_CABIN
        col += rtHeadlight(albedo, n, vPos);
        #endif
        col += glow;
        #ifndef RT_NOFOG
        col = rtFog(col, vPos, cameraPosition);
        #endif
        #ifdef RT_INK
        // an id from the colour, below the paint finish's 0.23: neighbouring parts of different colours get a line between them
        alpha = 0.04 + 0.17 * fract(dot(floor(albedo * 31.0 + 0.5), vec3(0.1031, 0.1137, 0.0973)) * 7.0);
        #endif
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  if ((o.opacity ?? 1) < 1) maskPreservingBlend(mat);
  return mat;
}

/** wind sway shared by trees and bushes: a slow lean with the wind plus a quicker flutter */
const GLSL_SWAY = /* glsl */ `
  uniform float uSway;
  vec3 rtSway(vec3 p, vec3 ip) {
    float ph = uTime * (0.9 + 1.6 * uWind.z) + ip.x * 0.37 + ip.z * 0.29;
    float bend = uSway * (0.12 + uWind.z) * p.y * p.y * 0.011;
    p.x += (sin(ph) * 0.6 + 0.4 * uWind.z * 2.0) * bend;
    p.z += cos(ph * 0.8 + 1.3) * 0.5 * bend;
    return p;
  }
`;

/**
 * Trees, bushes, cacti. Geometry: vertex colour = trunk colour, or white × depth in the crown;
 * aLeaf = 1 on foliage. Instance colour = (palette slot a, slot b, share of b) of the spot the plant stands on.
 */
export function foliageMaterial(o: { sway?: number; snowCap?: number; evergreen?: boolean } = {}): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.snowCap !== undefined) defines.RT_SNOW = '';
  if (o.evergreen) defines.RT_EVERGREEN = '';
  return new THREE.ShaderMaterial({
    defines,
    vertexColors: true,
    side: THREE.DoubleSide,
    uniforms: { ...globals, uSway: { value: o.sway ?? 0 }, uSnowCap: { value: o.snowCap ?? 0 }, tLeaf: { value: sharedTextures().leaf } },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      uniform vec4 uWind;
      uniform float uTime;
      ${GLSL_SWAY}
      attribute float aLeaf;
      attribute float aCard;
      varying vec3 vColor;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying float vLeaf;
      varying float vCard;
      varying vec2 vUv;
      varying float vVar;
      varying vec3 vLocal;
      void main() {
        vCard = aCard;
        vUv = uv;
        vec3 ip = vec3(0.0);
        #ifdef USE_INSTANCING
        ip = instanceMatrix[3].xyz;
        #endif
        vColor = color;
        vBw = vec4(1.0, 0.0, 0.0, 0.0);
        #ifdef USE_INSTANCING_COLOR
        vBw = rtSlotW(instanceColor.x, instanceColor.y, instanceColor.z);
        #endif
        vLeaf = aLeaf;
        vVar = fract(sin(dot(ip.xz + modelMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        vLocal = position;
        vec3 transformed = rtSway(position, ip + modelMatrix[3].xyz);
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      ${GLSL_LEAF_COVER}
      uniform float uSnowCap;
      uniform sampler2D tLeaf;
      varying vec3 vColor;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying float vLeaf;
      varying float vCard;
      varying vec2 vUv;
      varying float vVar;
      varying vec3 vLocal;
      void main() {
        #include <logdepthbuf_fragment>
        float leafTone = 0.75;
        float cover = rtLeafCover(tLeaf, vUv, leafTone);
        if (vCard > 0.5 && cover < 0.5) discard;
        vec3 n = normalize(vNormal);
        float sh = rtShadow(vPos, n);
        vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z));
        float facing = dot(n, L);
        vec3 col;
        vec3 albedo;
        if (vLeaf > 0.5) {
          RtPal p = rtPal(vBw);
          // leaf masses: depth in the crown (painted into the vertices), facing, a dab of brushwork
          float depth = (dot(vColor, vec3(0.333)) - 0.9) * 1.4;
          float dab = rtNoiseAt(rtWorldXZ(vPos) * 1.0 + vPos.y * vec2(0.71, -0.53), 2.2).r - 0.5;
          float tone = 0.34 + 0.34 * facing + depth * 1.3 + (vVar - 0.5) * 0.16 + dab * 0.3 - (1.0 - sh) * 0.34;
          // each painted leaf on a card has its own lightness
          tone += vCard * (leafTone - 0.76) * 0.9;
          albedo = rtWoodTone(p, tone);
          // autumn country (the palette says how far it has turned): its woods are painted red to gold by
          // tone; one tree in six is still green, one in five has gone all to yellow — and the firs among
          // them stay as dark as ever
          if (p.variety > 0.01) {
            #ifdef RT_EVERGREEN
            albedo = mix(albedo, mix(vec3(0.012, 0.07, 0.06), vec3(0.08, 0.26, 0.12), smoothstep(0.25, 0.85, tone)), p.variety);
            #else
            vec3 stillGreen = mix(vec3(0.03, 0.13, 0.05), vec3(0.2, 0.42, 0.1), smoothstep(0.2, 0.8, tone));
            vec3 gold = mix(vec3(0.5, 0.26, 0.03), vec3(0.95, 0.72, 0.12), smoothstep(0.25, 0.85, tone));
            albedo = mix(albedo, stillGreen, p.variety * step(vVar, 0.16) * 0.9);
            albedo = mix(albedo, gold, p.variety * smoothstep(0.76, 0.8, vVar) * 0.85);
            #endif
          }
          #ifdef RT_SNOW
          float snow = smoothstep(0.25, 0.7, n.y + dab * 0.4) * max(uSnowCap * p.misc.x, uWeather.y * 0.85);
          albedo = mix(albedo, rtSnowTone(tone), snow);
          #endif
          float lit = smoothstep(-0.1, 0.45, facing) * sh;
          col = albedo * (uSkyColor * 0.9 + uBounceColor * 0.5 + uSunColor * mix(0.05, 0.36, lit));
          // light through the leaves when looking towards the sun
          vec3 v = normalize(vPos - cameraPosition);
          float back = pow(max(dot(v, uSunDir), 0.0), 4.0) * smoothstep(0.0, -0.4, facing);
          col += albedo * uSunColor * 0.35 * back * sh;
        } else {
          albedo = vColor;
          col = rtCel(albedo, n, sh);
        }
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        // 0.7: the paint finish uses its finest brush here (leaf dabs stay round, not square)
        gl_FragColor = vec4(col, vLeaf > 0.5 ? 0.7 : 1.0);
      }`,
  });
}

/** Boulders and outcrops: flat facets, each turned its own way, in the biome's rock paints. */
export function rockMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      varying vec4 vBw;
      ${GLSL_SLOTS}
      void main() {
        vBw = vec4(1.0, 0.0, 0.0, 0.0);
        #ifdef USE_INSTANCING_COLOR
        vBw = rtSlotW(instanceColor.x, instanceColor.y, instanceColor.z);
        #endif
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      varying vec4 vBw;
      ${GLSL_SLOTS}
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
        RtPal p = rtPal(vBw);
        float sh = rtShadow(vPos, n);
        float facing = dot(n, normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z)));
        float tone = 0.5 + 0.5 * facing - (1.0 - sh) * 0.4;
        vec3 albedo = mix(p.rockShade, p.rockLit, smoothstep(0.42, 0.58, tone));
        float snow = smoothstep(0.3, 0.7, n.y) * max(p.misc.x * 0.8, uWeather.y * 0.85);
        albedo = mix(albedo, rtSnowTone(tone), snow);
        vec3 col = albedo * rtGroundLight(smoothstep(0.35, 0.6, tone) * sh);
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Tinted glass with a soft sky reflection towards grazing angles. */
export function glassMaterial(tint: THREE.ColorRepresentation = 0xbfd6dc, opacity = 0.16): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals, uColor: { value: new THREE.Color(tint) }, uOpacity: { value: opacity } },
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
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - abs(dot(n, v)), 3.0);
        vec3 col = mix(uColor * (uSkyColor * 0.8 + uSunColor * 0.1), uFogColor, fres);
        gl_FragColor = vec4(col, clamp(uOpacity + fres * 0.45, 0.0, 0.9));
      }`,
  });
  maskPreservingBlend(mat);
  return mat;
}

/** Flat ground of the proving ground: asphalt with a painted measuring grid. */
export function provingGroundMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
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
      float gridLine(vec2 w, float step, float width) {
        vec2 g = abs(fract(w / step - 0.5) - 0.5) * step;
        vec2 aa = fwidth(w) * 1.2;
        vec2 l = 1.0 - smoothstep(vec2(width) - aa, vec2(width) + aa, g);
        return max(l.x, l.y);
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float dist = length(vPos - cameraPosition);
        float n1 = rtFbm(w, 16.0);
        float n2 = rtFbm(w, 1.0);
        vec3 asphalt = mix(vec3(0.19, 0.2, 0.22), vec3(0.27, 0.27, 0.27), n1);
        asphalt *= 0.9 + 0.2 * n2 * (1.0 - smoothstep(20.0, 80.0, dist));
        vec3 albedo = asphalt;
        float fine = gridLine(w, 1.0, 0.012) * (1.0 - smoothstep(10.0, 40.0, dist));
        float mid = gridLine(w, 10.0, 0.05) * (1.0 - smoothstep(120.0, 400.0, dist));
        float big = gridLine(w, 100.0, 0.25);
        albedo = mix(albedo, vec3(0.42, 0.44, 0.46), fine * 0.35);
        albedo = mix(albedo, vec3(0.78, 0.76, 0.68), mid * 0.7);
        albedo = mix(albedo, vec3(0.9, 0.66, 0.3), big * 0.85);
        // skid-pad circle (R = 30 m around the origin) and centre line of the straight
        float r = length(w);
        float ring = 1.0 - smoothstep(0.1, 0.16, abs(r - 30.0));
        albedo = mix(albedo, vec3(0.92, 0.9, 0.84), ring * 0.9);
        vec3 col = albedo * rtGroundLight(1.0);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Soft dark discs laid on the ground under trees (instanced). Stands in for cast shadows. */
export function groundShadowMaterial(): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...globals, uStrength: { value: 0.3 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        mat4 m = modelMatrix;
        #ifdef USE_INSTANCING
        m = modelMatrix * instanceMatrix;
        #endif
        vec4 wp = m * vec4(position, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
        vFragDepth *= 0.9985;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      uniform float uStrength;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 d = (vUv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.4, 1.0, length(d));
        // shade = what is left when the sun is blocked: ambient only, so it carries the sky's tint
        float sun = smoothstep(-0.05, 0.25, uSunDir.y);
        float dist = length(vPos - cameraPosition);
        a *= uStrength * sun * (1.0 - smoothstep(250.0, 420.0, dist));
        // with real cast shadows the discs only fill in beyond the shadow map's reach
        a *= mix(1.0, smoothstep(60.0, 95.0, dist), uShadowParams.x);
        gl_FragColor = vec4(0.03, 0.05, 0.1, a);
      }`,
  });
  maskPreservingBlend(mat);
  return mat;
}

/**
 * Windscreen: tinted glass that collects raindrops; the wipers clear their arcs and the drops
 * grow back. uv: u left→right, v bottom→top, as the driver sees it.
 */
export const windscreenUniforms = {
  /** rain reaching the glass, 0…1 */
  uRain: { value: 0 },
  /** wiper cycle position 0…1 and seconds per cycle (0 = parked) */
  uWipe: { value: new THREE.Vector2(0, 0) },
};

export const WIPER_MAX_ANGLE = 1.75;

/** the glass as the wipers see it: size in metres, the two pivots along its foot (m from the left edge), blade length */
export interface WipeShape {
  width: number;
  height: number;
  pivots: [number, number];
  blade: number;
}

/** the first truck's screen: what the shader was drawn for */
export const TRUCK_WIPE: WipeShape = { width: 1.31, height: 0.61, pivots: [0.355, 0.975], blade: 0.41 };

export function windscreenMaterial(tint: THREE.ColorRepresentation = 0xc4dade, opacity = 0.1, wipe: WipeShape = TRUCK_WIPE): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...globals,
      ...windscreenUniforms,
      uColor: { value: new THREE.Color(tint) },
      uOpacity: { value: opacity },
      uGlass: { value: new THREE.Vector2(wipe.width, wipe.height) },
      uPivots: { value: new THREE.Vector2(wipe.pivots[0], wipe.pivots[1]) },
      uBlade: { value: wipe.blade },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uRain;
      uniform vec2 uWipe;
      varying vec2 vUv;
      uniform vec2 uGlass;    // metres
      uniform vec2 uPivots;   // the two wiper pivots along the foot of the glass (m from its left edge)
      uniform float uBlade;
      const float MAXA = ${WIPER_MAX_ANGLE.toFixed(3)};
      // seconds since a wiper blade last passed this point (large if never)
      float wipeAge(vec2 p) {
        float age = 1e3;
        for (int i = 0; i < 2; i++) {
          vec2 piv = vec2(i == 0 ? uPivots.x : uPivots.y, 0.015);
          vec2 q = p - piv;
          float rad = length(q);
          float ang = atan(q.y, q.x);
          if (rad < uBlade && rad > 0.05 && ang > 0.0 && ang < MAXA) {
            float a1 = ang / MAXA * 0.5;
            float ph = min(fract(uWipe.x - a1), fract(uWipe.x - (1.0 - a1)));
            age = min(age, ph * uWipe.y);
          }
        }
        return age;
      }
      void main() {
        #include <logdepthbuf_fragment>
        vec3 n = normalize(vNormal);
        vec3 v = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - abs(dot(n, v)), 3.0);
        vec3 col = mix(uColor * (uSkyColor * 0.8 + uSunColor * 0.1), uFogColor, fres);
        float alpha = clamp(uOpacity + fres * 0.45, 0.0, 0.9);
        if (uRain > 0.01) {
          vec2 p = vUv * uGlass;
          float age = uWipe.y > 0.0 ? wipeAge(p) : 1e3;
          float regrow = smoothstep(0.0, mix(2.2, 0.55, uRain), age);
          float drops = 0.0;
          float shade = 0.0;
          for (int layer = 0; layer < 2; layer++) {
            float sc = layer == 0 ? 34.0 : 61.0;
            vec2 g = p * sc + float(layer) * 13.7;
            vec2 id = floor(g);
            vec2 f = fract(g);
            float h = rtHash(id + 0.31);
            // each drop lives a few seconds, then another takes its place
            float cyc = uTime * (0.12 + 0.2 * h) + h * 9.0;
            float h2 = rtHash(id + floor(cyc) * 7.13);
            vec2 c = 0.3 + 0.4 * vec2(h2, rtHash(id + 3.7 + floor(cyc)));
            float r = (0.14 + 0.24 * h2) * smoothstep(0.0, 0.25, fract(cyc));
            float there = step(h, uRain * (layer == 0 ? 0.75 : 0.95));
            float dd = length(f - c);
            float dr = smoothstep(r, r * 0.55, dd) * there;
            drops = max(drops, dr);
            shade += dr * smoothstep(-r, r, f.y - c.y);
          }
          drops *= regrow;
          // a drop is a tiny lens: bright where it gathers the sky, darker at its lower rim
          vec3 dropCol = mix(uFogColor * 0.55, uFogColor * 1.25 + uSkyColor * 0.4, clamp(shade, 0.0, 1.0));
          col = mix(col, dropCol, drops * 0.85);
          alpha = max(alpha, drops * 0.62);
          // thin film of water where the blade has not been for a while
          alpha += 0.05 * uRain * regrow;
        }
        gl_FragColor = vec4(col, alpha);
      }`,
  });
  maskPreservingBlend(mat);
  return mat;
}

/** Mirror face: until real reflections exist it shows the horizon behind, in the current light. */
export function mirrorMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec3 objNormal = normal;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec2 vUv;
      void main() {
        #include <logdepthbuf_fragment>
        // painted view behind: road and verge below, a band of far hills, sky above (until real reflections exist)
        vec3 light = uSkyColor * 0.6 + uSunColor * 0.25;
        float y = vUv.y + (rtHash(floor(vUv * vec2(18.0, 9.0))) - 0.5) * 0.03;
        vec3 road = vec3(0.24, 0.24, 0.27) * light;
        vec3 verge = vec3(0.2, 0.42, 0.1) * light;
        vec3 hills = mix(vec3(0.16, 0.34, 0.2) * light, uFogColor, 0.45);
        vec3 col = mix(road, verge, smoothstep(0.18, 0.3, abs(vUv.x - 0.5) * 2.0 - (0.42 - y)));
        col = mix(col, hills, smoothstep(0.36, 0.4, y));
        col = mix(col, mix(uFogColor, uSkyColor * 1.4, smoothstep(0.55, 1.0, y)), smoothstep(0.47, 0.52, y + 0.03 * sin(vUv.x * 12.0)));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** shared vertex code of grass and flowers: where the root is, how far, how the wind bends it */
function grassVertexHead(fade: { extra: readonly number[]; all: readonly number[] }, keepFar: number): string {
  return /* glsl */ `
      attribute vec4 aRoot;   // tile-local root (x, y, z), size
      attribute vec4 aInfo;   // grass: slot a + 4 × slot b, share of b, keep, turn | flowers: colour, keep, turn, slot
      vec3 rtRootWorld() { return (modelMatrix * vec4(aRoot.xyz, 1.0)).xyz; }
      // tufts beyond the near ring that far tiles do not hold shrink away first, then all of them
      float rtGrassKeep(float keep, float dist) {
        float k = 1.0 - smoothstep(${fade.all[0].toFixed(1)}, ${fade.all[1].toFixed(1)}, dist);
        if (keep >= ${keepFar.toFixed(3)}) k *= 1.0 - smoothstep(${fade.extra[0].toFixed(1)}, ${fade.extra[1].toFixed(1)}, dist);
        return k;
      }
      vec3 rtTurn(vec3 p, float a) {
        float c = cos(a);
        float s = sin(a);
        return vec3(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
      }
      // the wind leans the plant over, a gust field rolls through, each plant flutters on its own phase
      vec3 rtGrassBend(vec3 root, float tip, float phase) {
        vec2 w = rtWorldXZ(root);
        float gust = rtNoiseAt(w * 0.5 - uWind.xy * uWind.w, 60.0).b;
        float ph = uTime * (1.4 + 2.2 * uWind.z) + phase;
        float bend = (0.05 + 0.32 * uWind.z * (0.4 + gust)) * tip * tip;
        vec2 d = uWind.xy * (sin(ph) * 0.35 + 0.65 * uWind.z + 0.2) + vec2(cos(ph * 0.7), sin(ph * 0.6 + 2.0)) * 0.22;
        return vec3(d.x, -0.25 * bend, d.y) * bend;
      }
  `;
}

export interface GrassFade {
  extra: readonly number[];
  all: readonly number[];
}

/**
 * Grass: instanced tufts (InstancedBufferGeometry: aRoot, aInfo per tuft) in the ground paint of the
 * spot they grow from. The tone is read at the root from the same brushwork the ground uses, so
 * grass and ground are one paint; tips are lighter and warmer and glow when the sun is behind them.
 */
export function grassMaterial(fade: GrassFade, keepFar: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${GLSL_COMMON}
      ${grassVertexHead(fade, keepFar)}
      attribute float aTip;
      attribute float aBlade;
      varying vec3 vPos;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying float vTip;
      varying float vTone;
      varying float vWarm;
      varying float vBlade;
      void main() {
        vec3 root = rtRootWorld();
        float dist = length(root - cameraPosition);
        float s = aRoot.w * rtGrassKeep(aInfo.z, dist);
        vec3 p = rtTurn(position * s, aInfo.w);
        p += rtGrassBend(root, aTip * s, root.x * 0.9 + root.z * 0.7 + aBlade * 2.0);
        vTip = aTip;
        vBlade = aBlade;
        vec2 w = rtWorldXZ(root);
        // the tone of the brush mark the tuft stands in (as the ground has it on level ground)
        float brush = (rtStrokeAt(w, 6.0) - 0.5) * 0.6 + (rtStrokeAt(w + vec2(17.0, 5.0), 27.0) - 0.5) * 0.5
                    + (rtStrokeAt(w + vec2(-41.0, 73.0), 95.0) - 0.5) * 0.42;
        vTone = 0.5 + brush + (rtNoiseAt(w, 640.0).r - 0.5) * 0.28;
        vWarm = rtNoiseAt(w + 13.0, 300.0).g;
        vBw = rtSlotPair(aInfo.x, aInfo.y);
        vec4 wp = vec4(root + p, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      varying vec3 vPos;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying float vTip;
      varying float vTone;
      varying float vWarm;
      varying float vBlade;
      void main() {
        #include <logdepthbuf_fragment>
        RtPal p = rtPal(vBw);
        vec3 n = vec3(0.0, 1.0, 0.0);
        float sh = rtShadow(vPos, n);
        // each blade one of a few paints (its own tone), only a little lighter towards the tip
        float pick = floor(vBlade * 5.0) / 4.0 - 0.5;
        float tone = vTone - 0.04 + (vTip - 0.5) * 0.28 + pick * 0.55 - (1.0 - sh) * 0.22;
        vec3 albedo = rtPaintTone(p, tone);
        albedo *= mix(vec3(1.0), p.warm, smoothstep(0.56, 0.66, vWarm) * 0.85);
        // dry grass in dry country, towards the tips, and one blade in eight gone to straw anywhere
        float straw = max(clamp(p.misc.y * 0.8, 0.0, 1.0), step(0.875, vBlade) * 0.85);
        albedo = mix(albedo, p.dry * mix(0.8, 1.35, vTip), straw);
        albedo *= mix(vec3(1.0), vec3(1.1, 1.05, 0.8), vTip * 0.45);
        vec2 w = rtWorldXZ(vPos);
        float snow = uWeather.y * smoothstep(0.2, 0.7, vTip + (rtFbm(w, 16.0) - 0.5) * 0.3);
        albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0) * 0.8);
        albedo *= 1.0 - 0.18 * uWeather.x;
        // down among the blades the sun does not reach: the roots are lit by the sky
        vec3 col = albedo * rtGroundLight(sh * mix(0.35, 1.0, smoothstep(0.0, 0.7, vTip)));
        // light through the blades when the sun is behind them
        vec3 v = normalize(vPos - cameraPosition);
        float back = pow(max(dot(v, uSunDir), 0.0), 3.0) * vTip;
        col += albedo * uSunColor * vec3(0.5, 0.45, 0.2) * back * sh;
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Meadow flowers: a stalk in the grass paint and a small round head in one of the biome's flower colours. */
export function flowerMaterial(fade: GrassFade, keepFar: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${GLSL_COMMON}
      ${grassVertexHead(fade, keepFar)}
      attribute float aHead;
      varying vec3 vPos;
      varying float vHead;
      varying vec2 vUv;
      varying float vPick;
      varying float vSlot;
      void main() {
        vec3 root = rtRootWorld();
        float dist = length(root - cameraPosition);
        float s = aRoot.w * rtGrassKeep(aInfo.y, dist);
        vec3 p = rtTurn(position * s, aInfo.z);
        float tip = clamp(position.y / 0.5, 0.0, 1.0);
        p += rtGrassBend(root, tip * s, root.x * 0.9 + root.z * 0.7);
        vHead = aHead;
        vUv = uv;
        vPick = aInfo.x;
        vSlot = aInfo.w;
        vec4 wp = vec4(root + p, 1.0);
        vPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      varying vec3 vPos;
      varying float vHead;
      varying vec2 vUv;
      varying float vPick;
      varying float vSlot;
      void main() {
        #include <logdepthbuf_fragment>
        int si = int(vSlot + 0.5);
        vec3 albedo = uGroundPal[si * 3 + 1];
        if (vHead > 0.5) {
          // a cosmos: eight petals round a small eye
          float r = length(vUv);
          float petals = 0.62 + 0.38 * abs(cos(atan(vUv.y, vUv.x) * 4.0));
          if (r > petals) discard;
          albedo = vPick < 0.5 ? uFlowerPal[si * 3] : vPick < 1.5 ? uFlowerPal[si * 3 + 1] : uFlowerPal[si * 3 + 2];
          albedo *= mix(0.82, 1.08, smoothstep(0.2, 0.9, r));
          albedo = mix(vec3(0.85, 0.62, 0.08), albedo, smoothstep(0.16, 0.24, r));
        }
        vec3 n = vec3(0.0, 1.0, 0.0);
        float sh = rtShadow(vPos, n);
        vec3 col = albedo * rtGroundLight(sh);
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * Far woods: cards facing the camera, each a strip of painted tree masses (textures.ts woodsTexture),
 * coloured with the biome's four wood greens. They are already flat paint, so they write alpha 0.5
 * and the paint finish leaves them alone.
 */
export function farWoodsMaterial(fade: { in: readonly number[]; out: readonly number[] }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals, tWoods: { value: sharedTextures().woods } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aRoot;   // tile-local root (x, y, z), size
      attribute vec4 aInfo;   // slot a + 4 × slot b, share of b, random, variant
      varying vec3 vPos;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying vec2 vUv;
      varying float vRand;
      void main() {
        vec3 root = (modelMatrix * vec4(aRoot.xyz, 1.0)).xyz;
        vec3 toCam = cameraPosition - root;
        float dist = length(toCam.xz);
        float s = aRoot.w * smoothstep(${fade.in[0].toFixed(1)}, ${fade.in[1].toFixed(1)}, dist) * (1.0 - smoothstep(${fade.out[0].toFixed(1)}, ${fade.out[1].toFixed(1)}, dist));
        vec3 right = normalize(vec3(toCam.z, 0.0, -toCam.x));
        float flip = aInfo.z < 0.5 ? 1.0 : -1.0;
        vec3 wp = root + right * position.x * 38.0 * s + vec3(0.0, position.y * 27.0 * s, 0.0);
        vUv = vec2((aInfo.w + 0.5 + position.x * flip * 0.98) / 4.0, position.y);
        vBw = rtSlotPair(aInfo.x, aInfo.y);
        vRand = aInfo.z;
        vPos = wp;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      uniform sampler2D tWoods;
      varying vec3 vPos;
      varying vec4 vBw;
      ${GLSL_SLOTS}
      varying vec2 vUv;
      varying float vRand;
      void main() {
        #include <logdepthbuf_fragment>
        // sharper mips: averaged far away, a card's coverage would fill its whole rectangle
        vec4 t = texture2D(tWoods, vUv, -1.5);
        vec2 dx = dFdx(vUv * vec2(1024.0, 256.0));
        vec2 dy = dFdy(vUv * vec2(1024.0, 256.0));
        float lod = 0.5 * log2(max(max(dot(dx, dx), dot(dy, dy)), 1.0));
        if (t.g < 0.5) discard;
        RtPal p = rtPal(vBw);
        // lit from the front when the sun is behind the viewer, darker against the light
        vec2 toCam = normalize(cameraPosition.xz - vPos.xz);
        float front = dot(toCam, normalize(uSunDir.xz + vec2(1e-4)));
        // the woods are the darkest thing in the distance: mostly the deep greens, light only on the crowns
        float tone = t.r * 0.78 - 0.04 + (vRand - 0.5) * 0.12 + 0.08 * front;
        vec3 albedo = rtWoodTone(p, tone);
        vec3 col = albedo * (uSkyColor * 0.9 + uBounceColor * 0.5 + uSunColor * mix(0.04, 0.3, smoothstep(0.35, 0.8, t.r)) * (0.75 + 0.25 * front));
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 0.5);
      }`,
  });
}

