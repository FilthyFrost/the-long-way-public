/**
 * The material of the plants of a world of version 2 (docs/V3/nodes/W2-flora.md; scene/plantRegistry.ts says
 * why they are drawn this way). One material for every plant: a vertex does not come from the mesh but from
 * the plants' atlas, a texture holding every model, by the number of the vertex and what the instance says of
 * its model; so one instanced draw holds plants of any number of kinds.
 *
 * It paints as the foliage of the first renderer does (materials.ts foliageMaterial, specs/art/STYLE.md §2.3:
 * clumps in four tones chosen by how a ball of leaves faces the light), with what the plant catalogue adds:
 *   a plant with a colour of its own is painted in four tones of that colour instead of its region's woods;
 *   the parts its second colour paints (bark, canes, plumes, flower heads) are lit as cel surfaces;
 *   what it bears (fruit, berries) shows on the instances that bear;
 *   stone is painted as rockMaterial paints it.
 *
 * The shadow pass draws these plants in a pass of their own through the same vertex code (shadow.ts): FLORA_VERTEX.
 */
import * as THREE from 'three';
import { GLSL_LEAF_COVER } from './materials';
import { GLSL_PAINT, GLSL_SLOTS } from './paint';
import { GLSL_COMMON, globals } from './shaderlib';
import { sharedTextures } from './textures';

/** the plants' atlas, for every material that reads it (set by whoever builds the registry: scene/worldView.ts) */
export const floraUniforms = {
  tPlants: { value: null as THREE.Texture | null },
};

/**
 * GLSL (vertex stage): the instance attributes, the atlas, and rtPlantVertex — the vertex of this number of
 * this instance's model, set where the plant stands: turned, scaled, laid with its ground or leant, and (with
 * `wind`) bent by the wind. False: this vertex is none of the plant's (its model has fewer, or it is fruit
 * the plant does not bear) and the caller throws it away.
 */
export const FLORA_VERTEX = /* glsl */ `
  uniform vec4 uWeather;
  uniform sampler2D tPlants;
  attribute vec4 aPlace;   // tile-local x, y, z; turn
  attribute vec4 aShape;   // scale across, scale up, first vertex in the atlas, vertices
  attribute vec4 aLook;    // palette slots + settled snow / 4; share of b + 2 bears + 4 evergreen + 8 deciduous wood; first colour; second colour
  attribute vec4 aLie;     // ground slope along x and z; the plant's own number; lean
  bool rtPlantVertex(mat4 model, float wind, float time, out vec3 world, out vec3 normal, out vec4 leaf, out vec3 colour, out float part) {
    world = vec3(0.0);
    normal = vec3(0.0, 1.0, 0.0);
    leaf = vec4(0.0);
    colour = vec3(1.0);
    part = 0.0;
    if (float(gl_VertexID) >= aShape.w) return false;
    int v = int(aShape.z) + gl_VertexID;
    ivec2 at = ivec2((v & 255) * 4, v >> 8);
    vec4 t0 = texelFetch(tPlants, at, 0);
    part = t0.w;
    float flags = floor(aLook.y * 0.5);
    // Deciduous wood keeps its twigs, including in the shadow pass. Herbaceous plants keep their own geometry.
    if (aLook.y >= 8.0 && max(fract(aLook.x) * 4.0, uWeather.y) > 0.5 + 0.18 * aLie.z &&
        ((part > 0.5 && part < 1.5) || (part > 2.5 && part < 3.5))) return false;
    // fruit shows on the plants that bear, and on no other
    if (part > 2.5 && part < 3.5 && mod(flags, 2.0) < 0.5) return false;
    leaf = texelFetch(tPlants, at + ivec2(1, 0), 0);
    vec3 n = texelFetch(tPlants, at + ivec2(2, 0), 0).xyz;
    colour = texelFetch(tPlants, at + ivec2(3, 0), 0).rgb;
    vec3 root = (model * vec4(aPlace.xyz, 1.0)).xyz;
    float c = cos(aPlace.w);
    float s = sin(aPlace.w);
    vec3 p = t0.xyz * vec3(aShape.x, aShape.y, aShape.x);
    p = vec3(c * p.x + s * p.z, p.y, c * p.z - s * p.x);
    n = n / vec3(aShape.x, aShape.y, aShape.x);
    normal = normalize(vec3(c * n.x + s * n.z, n.y, c * n.z - s * n.x));
    // a low plant lies with its ground; a tree stands plumb, leaning a little its own way
    p.xz += p.y * aLie.w * vec2(cos(aPlace.w * 3.0), sin(aPlace.w * 3.0));
    p.y += dot(aLie.xy, p.xz);
    // the wind: a slow lean with it and a quicker flutter, each plant on its own phase (as the first foliage)
    float ph = time * (0.9 + 1.6 * wind) + root.x * 0.37 + root.z * 0.29;
    float bend = (part > 3.5 ? 0.0 : 1.0) * (0.12 + wind) * leaf.w * leaf.w * 0.011 * aShape.x;
    p.x += (sin(ph) * 0.6 + 0.4 * wind * 2.0) * bend;
    p.z += cos(ph * 0.8 + 1.3) * 0.5 * bend;
    world = root + p;
    return true;
  }
`;

/** the material every plant of a world of version 2 is drawn with (the atlas: floraUniforms.tPlants) */
export function floraMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { ...globals, ...floraUniforms, tLeaf: { value: sharedTextures().leaf } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform vec4 uWind;
      uniform float uTime;
      ${FLORA_VERTEX}
      ${GLSL_SLOTS}
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec4 vBw;
      varying float vPart;
      varying float vCard;
      varying vec2 vUv;
      varying float vVar;
      varying vec4 vTint;    // the plant's first colour (linear); w < 0: its region's palette
      varying vec3 vTint2;
      varying float vEver;
      varying float vSettled;
      // a colour written as one number, 0xRRGGBB, as the linear colour it stands for
      vec3 rtHexColour(float h) {
        vec3 s = vec3(floor(h / 65536.0), mod(floor(h / 256.0), 256.0), mod(h, 256.0)) / 255.0;
        return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s));
      }
      void main() {
        vec3 world;
        vec3 n;
        vec4 leaf;
        if (!rtPlantVertex(modelMatrix, uWind.z, uTime, world, n, leaf, vColor, vPart)) {
          // (not a vertex of this plant: all three corners of its triangle fall on one point)
          gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }
        vPos = world;
        vNormal = n;
        vUv = leaf.xy;
        vCard = leaf.z;
        vVar = aLie.z;
        float flags = floor(aLook.y * 0.5);
        vEver = mod(floor(flags * 0.5), 2.0);
        vSettled = fract(aLook.x) * 4.0;
        vBw = rtSlotPair(aLook.x, aLook.y - 2.0 * flags);
        vTint = aLook.z < 0.0 ? vec4(0.0, 0.0, 0.0, -1.0) : vec4(rtHexColour(aLook.z), 1.0);
        vTint2 = rtHexColour(max(aLook.w, 0.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      ${GLSL_PAINT}
      ${GLSL_LEAF_COVER}
      uniform sampler2D tLeaf;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying vec4 vBw;
      varying float vPart;
      varying float vCard;
      varying vec2 vUv;
      varying float vVar;
      varying vec4 vTint;
      varying vec3 vTint2;
      varying float vEver;
      varying float vSettled;
      // Four tones of one colour, as a wood's four greens are four tones: the colour itself where the light
      // falls full on a crown, deeper and more of itself in the half light, and towards a cool dark inside
      // (the shade of a leaf mass is sky, not black: STYLE.md 2.2). The tones keep their distance from one
      // another whatever the colour's own lightness: a dark plant is not painted black. A warm colour's shade
      // goes to crimson, not to blue.
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
      void main() {
        #include <logdepthbuf_fragment>
        float leafTone = 0.75;
        float cover = rtLeafCover(tLeaf, vUv, leafTone);
        if (vCard > 0.5 && cover < 0.5) discard;
        // (a stone's facets are its faces as they are drawn: asked for outside every branch)
        vec3 face = normalize(cross(dFdx(vPos), dFdy(vPos)));
        vec3 n = normalize(vNormal);
        vec3 L = normalize(vec3(uSunDir.x, max(uSunDir.y, 0.25), uSunDir.z));
        vec3 col;
        vec3 albedo;
        float load = max(vSettled, uWeather.y);
        float alpha = 1.0;
        if (vPart > 3.5) {
          // stone: flat facets, each turned its own way, in the region's two rock paints (rockMaterial)
          n = face;
          RtPal p = rtPal(vBw);
          float sh = rtShadow(vPos, n);
          float tone = 0.5 + 0.5 * dot(n, L) - (1.0 - sh) * 0.4;
          albedo = mix(p.rockShade, p.rockLit, smoothstep(0.42, 0.58, tone));
          if (vPart > 4.5) {
            vec2 uv = rtWorldXZ(vPos) + vec2(0.37, -0.62) * vPos.y;
            float wash = rtNoiseAt(uv * vec2(1.1, 0.66), 1.8).r;
            bool fines = vColor.b < vColor.g * 0.18;
            if (fines && wash * 0.82 + vColor.r < 0.76) discard;
            float edge = tone + (wash - 0.5) * 0.23;
            vec3 dark = vTint.rgb * vec3(0.47, 0.54, 0.67);
            vec3 middle = vTint.rgb * vec3(0.88, 0.87, 0.86);
            vec3 sunward = vTint.rgb * vec3(1.22, 1.16, 1.07);
            albedo = mix(mix(dark, middle, smoothstep(0.37, 0.43, edge)), sunward, smoothstep(0.70, 0.76, edge)) * (fines ? vec3(0.67 + wash*0.18) : vColor);
            float moss = smoothstep(0.38,0.85,n.y) * smoothstep(0.45,0.63,wash+0.16*(vVar-0.5));
            albedo = mix(albedo, vTint2 * (0.70 + 0.7*wash), moss * 0.78);
          }
          float snow = smoothstep(0.35, 0.85, n.y) * load * (vPart > 4.5 ? 0.80 : 1.0);
          albedo = mix(albedo, rtSnowTone(tone), snow);
          col = albedo * rtGroundLight(smoothstep(0.35, 0.6, tone) * sh);
        } else if (vPart > 1.5) {
          // what the second colour paints: bark, a cane, a plume, a flower head, fruit
          float sh = rtShadow(vPos, n);
          albedo = mix(vTint2 * vColor, rtSnowTone(0.65), load * smoothstep(0.18, 0.72, n.y));
          col = rtCel(albedo, n, sh);
        } else if (vPart > 0.5) {
          RtPal p = rtPal(vBw);
          float sh = rtShadow(vPos, n);
          float facing = dot(n, L);
          // leaf masses: depth in the crown (painted into the vertices), facing, a dab of brushwork
          float depth = (dot(vColor, vec3(0.333)) - 0.9) * 1.4;
          float dab = rtNoiseAt(rtWorldXZ(vPos) * 1.0 + vPos.y * vec2(0.71, -0.53), 2.2).r - 0.5;
          float tone = 0.34 + 0.34 * facing + depth * 1.3 + (vVar - 0.5) * 0.16 + dab * 0.3 - (1.0 - sh) * 0.34;
          // each painted leaf on a card has its own lightness. (Chosen, not multiplied by vCard: a blade or a
          // crown's inner ball is no card, its uv is the same at every corner, and the leaf texture read with no
          // change of uv across the triangle can come back as no number at all — which times nought is still
          // none, and paints the whole blade black.)
          tone += vCard > 0.5 ? (leafTone - 0.76) * 0.9 : 0.0;
          if (vTint.w > 0.0) {
            albedo = rtTintTone(vTint.rgb, tone);
          } else {
            albedo = rtWoodTone(p, tone);
            // autumn country: as the first foliage (red to gold by tone, a tree in six still green, one in
            // five gone to yellow, what keeps its leaves as dark as ever)
            if (p.variety > 0.01) {
              if (vEver > 0.5) {
                albedo = mix(albedo, mix(vec3(0.012, 0.07, 0.06), vec3(0.08, 0.26, 0.12), smoothstep(0.25, 0.85, tone)), p.variety);
              } else {
                vec3 stillGreen = mix(vec3(0.03, 0.13, 0.05), vec3(0.2, 0.42, 0.1), smoothstep(0.2, 0.8, tone));
                vec3 gold = mix(vec3(0.5, 0.26, 0.03), vec3(0.95, 0.72, 0.12), smoothstep(0.25, 0.85, tone));
                albedo = mix(albedo, stillGreen, p.variety * step(vVar, 0.16) * 0.9);
                albedo = mix(albedo, gold, p.variety * smoothstep(0.76, 0.8, vVar) * 0.85);
              }
            }
          }
          float snow = smoothstep(0.25, 0.7, n.y + dab * 0.4) * load;
          albedo = mix(albedo, rtSnowTone(tone), snow);
          float lit = smoothstep(-0.1, 0.45, facing) * sh;
          col = albedo * (uSkyColor * 0.9 + uBounceColor * 0.5 + uSunColor * mix(0.05, 0.36, lit));
          // light through the leaves when looking towards the sun
          vec3 v = normalize(vPos - cameraPosition);
          float back = pow(max(dot(v, uSunDir), 0.0), 4.0) * smoothstep(0.0, -0.4, facing);
          col += albedo * uSunColor * 0.35 * back * sh;
          // 0.7: the paint finish uses its finest brush here (leaf dabs stay round, not square)
          alpha = 0.7;
        } else {
          float sh = rtShadow(vPos, n);
          albedo = mix(vColor, rtSnowTone(0.65), load * smoothstep(0.18, 0.72, n.y));
          col = rtCel(albedo, n, sh);
        }
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, alpha);
      }`,
  });
}
