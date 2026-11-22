/**
 * Rock painted (G5, docs/V3/nodes/G-ghibli.md): the material of the rock that stands by itself — a coast's stacks and
 * its arch, a pillar mountain's pillars, a karst's towers (scene/rockForms.ts carves them). Everything a painter puts
 * on a cliff is laid here pixel by pixel, in the world's own metres, so a face holds its drawing from its foot to
 * the horizon — the mesh gives the blocks and the ledges, the paint what is on them:
 *
 *   its beds        thin layers a couple of metres thick gathered into thicker ones, each a tone and a warmth of its
 *                   own, bent a little by a slow noise; a dark broken line along each bedding plane;
 *   its planes      facets at three sizes — nine metres, three, one — each turned its own way to the light, the joints
 *                   between them dark hair lines (Painted Valley's way with a range, at a crag's scale);
 *   its weather     the rain's dark streaks down it and the pale ones where the water runs clean; in the clefts and
 *                   under the ledges the rock deeper;
 *   the sea's mark  on a sea's rock: wet and near black at the water, a band of dark weed above that, then the salt's
 *                   pale band;
 *   what grows      turf on its top spilling ragged over the rim, moss on its ledges, on a green rock the wood's
 *                   green hung in patches down its walls.
 *
 * Its light is a painter's: the lit planes in the sun's colour, the planes turned away in the sky's — the rock's own
 * shade colour, never grey — meeting along a clean edge; the undersides of its ledges and the sides of its blocks turned
 * from the sun are its own shadows.
 *
 * Per vertex: aRock = (a number of its block's own 0 … 1, metres above its level — the sea's or the land's —, how
 * deep in a cleft or a hollow 0 … 1, how green 0 … 1 plus 1 where its top's turf lies).
 */
import * as THREE from 'three';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, GLSL_VERTEX_MAIN, GLSL_VERTEX_PARS, globals } from './shaderlib';

export interface RockPaint {
  /** its rock in the light and in the shade, its moss and turf, the green that hangs on it (linear) */
  lit: THREE.Color;
  shade: THREE.Color;
  moss: THREE.Color;
  wood: THREE.Color;
  /** 1: a sea's rock (the water's mark on it) */
  sea: number;
  /** how strongly its beds show, 0 … 1 (a sandstone's and a limestone's 1, a granite's hardly) */
  beds: number;
}

export function rockMaterial(p: RockPaint): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...globals,
      uRockLit: { value: p.lit.clone() },
      uRockShade: { value: p.shade.clone() },
      uRockMoss: { value: p.moss.clone() },
      uRockWood: { value: p.wood.clone() },
      uRockKind: { value: new THREE.Vector4(p.sea, p.beds, 0, 0) },
    },
    vertexShader: /* glsl */ `
      ${GLSL_VERTEX_PARS}
      attribute vec4 aRock;
      varying vec4 vRock;
      void main() {
        vec3 transformed = position;
        vec3 objNormal = normal;
        vRock = aRock;
        ${GLSL_VERTEX_MAIN}
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      uniform vec3 uRockLit;
      uniform vec3 uRockShade;
      uniform vec3 uRockMoss;
      uniform vec3 uRockWood;
      uniform vec4 uRockKind;
      varying vec4 vRock;
      vec3 rkCells(vec2 x) {
        vec4 t = texture2D(tCells, x / 64.0);
        return vec3(t.r * 0.5, t.g, t.b);
      }
      void main() {
        #include <logdepthbuf_fragment>
        // a face of the mesh is a face of the rock: its own plane, its edges eased a little by the mesh's normals
        vec3 nf = normalize(cross(dFdx(vPos), dFdy(vPos)));
        vec3 n = normalize(mix(normalize(vNormal), nf, 0.8));
        float px = max(length(fwidth(vPos)) * 0.72, 1e-3);
        vec2 w = rtWorldXZ(vPos);
        float y = rtWorldY(vPos);
        float wallK = 1.0 - smoothstep(0.55, 0.85, nf.y);
        // the face's own plane: along its contour and up it (a top's: its plan)
        vec2 along = normalize(vec2(-nf.z, nf.x) + vec2(1e-5, 0.0));
        vec2 fq = wallK > 0.5 ? vec2(dot(w, along), y) : w;
        float cav = clamp(vRock.z, 0.0, 1.0);
        float green = min(vRock.w, 1.0);
        float cap = clamp(vRock.w - 1.0, 0.0, 1.0);

        // ---- its beds: thin ones gathered in threes or so into thick ones, each its own tone and warmth
        float warp = (rtNoiseAt(w, 140.0).r - 0.5) * 7.0 + (rtNoiseAt(w + 31.0, 23.0).g - 0.5) * 1.3;
        float bc = (y + warp) / 2.3;
        float lam = floor(bc);
        float fb = fract(bc);
        float thick = floor(bc / 3.0 + rtHash(vec2(floor(bc / 9.0), 5.0)));
        float kLam = 1.0 - smoothstep(0.5, 1.5, px);
        float kThick = 1.0 - smoothstep(2.0, 6.0, px);
        float tone = 0.5 + ((rtHash(vec2(thick, 3.7)) - 0.5) * kThick + (rtHash(vec2(lam, 9.1)) - 0.5) * 0.5 * kLam) * uRockKind.y;
        float warm = (rtHash(vec2(thick, 1.3)) - 0.5) * kThick * uRockKind.y;
        float lw = fwidth(bc) * 1.2 + 0.03;
        float line = (1.0 - smoothstep(0.0, lw, min(fb, 1.0 - fb))) * kLam * wallK * uRockKind.y;
        line *= smoothstep(0.3, 0.6, rtNoiseAt(fq * vec2(0.25, 1.0) + 5.0, 9.0).g + 0.3 * rtHash(vec2(lam, 1.0)));

        // ---- its planes: facets at three sizes, each turned its own way, hair-line joints between them
        float turn = 0.0;
        float val = 0.0;
        float joint = 0.0;
        float wsum = 0.0;
        for (int i = 0; i < 3; i++) {
          float sz = i == 0 ? 9.0 : i == 1 ? 2.8 : 0.9;
          float wt = i == 0 ? 1.0 : i == 1 ? 0.7 : 0.45;
          float k = 1.0 - smoothstep(0.07, 0.2, px / sz);
          if (k <= 0.0) continue;
          // (the rock breaks along its beds: its planes wider than they are tall)
          vec3 c = rkCells(fq * vec2(1.0, 1.7) / sz + float(i) * 7.31);
          // (only the great planes turn to or from the light: the small ones are tone, or a face at a glancing sun is confetti)
          turn += (c.y - 0.5) * wt * k * (i == 0 ? 1.0 : i == 1 ? 0.35 : 0.0);
          val += (c.z - 0.5) * wt * k;
          wsum += wt * k;
          float jpx = c.x * sz / px;
          joint = max(joint, (1.0 - smoothstep(0.5, 1.7, jpx)) * k * (1.0 - 0.2 * float(i)));
        }
        val /= max(wsum, 0.4);
        joint *= smoothstep(0.3, 0.55, rtNoiseAt(fq * 0.37 + 3.7, 1.0).g);

        // ---- its weather: the rain's streaks down its walls, dark and here and there pale
        float sk = rtNoiseAt(vec2(fq.x * 0.55, fq.y * 0.03) + 5.0, 1.0).r;
        float sk2 = rtNoiseAt(vec2(fq.x * 1.7, fq.y * 0.05) + 11.0, 1.0).g;
        float kStreak = 1.0 - smoothstep(1.5, 5.0, px);
        float streak = smoothstep(0.52, 0.8, sk * 0.65 + sk2 * 0.35) * wallK * kStreak;
        float pale = smoothstep(0.76, 0.92, sk2) * wallK * (1.0 - streak) * kStreak;

        vec3 lit = uRockLit * (0.84 + 0.32 * tone) * (1.0 + vec3(0.1, 0.02, -0.1) * warm) * (1.0 + 0.24 * val);
        vec3 shade = uRockShade * (0.86 + 0.28 * tone) * (1.0 + 0.2 * val);
        float dark = max(joint * 0.5, line * 0.4);
        lit *= (1.0 - dark) * (1.0 - 0.34 * streak);
        shade *= (1.0 - dark * 0.8) * (1.0 - 0.3 * streak);
        lit = mix(lit, uRockLit * 1.22, pale * 0.32);

        // ---- the sea's mark: wet and near black at the water, a band of weed, the salt's pale band above
        if (uRockKind.x > 0.5) {
          float hn = vRock.y + (rtNoiseAt(fq, 6.0).b - 0.5) * 1.3;
          float wet = 1.0 - smoothstep(0.3, 1.7, hn);
          float weed = smoothstep(0.5, 1.3, hn) * (1.0 - smoothstep(2.1, 3.3, hn));
          float salt = smoothstep(2.6, 3.8, hn) * (1.0 - smoothstep(5.0, 8.5, hn));
          lit = mix(lit, lit * vec3(0.3, 0.33, 0.36), wet);
          shade = mix(shade, shade * vec3(0.42, 0.46, 0.52), wet);
          lit = mix(lit, vec3(0.075, 0.115, 0.06), weed * 0.72);
          shade = mix(shade, vec3(0.03, 0.05, 0.035), weed * 0.72);
          lit = mix(lit, vec3(0.8, 0.79, 0.74), salt * 0.3 * (0.4 + 0.6 * sk2));
        }

        // ---- what grows on it: turf on its top, ragged over the rim; moss on its ledges; the wood's green hung on a green rock
        float up = smoothstep(0.5, 0.82, n.y);
        float mossN = rtNoiseAt(w + 3.0, 5.0).g;
        float moss = up * smoothstep(0.8 - 0.75 * green, 0.98 - 0.5 * green, mossN + 0.22);
        float ragged = (rtNoiseAt(fq + 9.0, 3.2).r - 0.5) * 0.9 + (rtNoiseAt(fq + 2.0, 0.9).g - 0.5) * 0.35;
        float turf = max(moss, smoothstep(0.3, 0.55, cap + ragged * (1.0 - smoothstep(0.75, 1.0, cap))));
        // (in broad soft patches: speckled over the whole wall it was a camouflage, and the rock under it was lost)
        float hungN = rtNoiseAt(fq * vec2(1.0, 0.6) + 17.0, 14.0).r + (rtNoiseAt(fq + 4.0, 5.0).b - 0.5) * 0.16;
        float hung = green * wallK * smoothstep(0.66, 0.8, hungN + 0.12 * green - 0.15 * cav) * (1.0 - cap) * 0.85;
        vec3 turfLit = uRockMoss * (0.9 + 0.3 * mossN);
        vec3 turfShade = uRockMoss * vec3(0.3, 0.5, 0.62);
        lit = mix(lit, turfLit, turf);
        shade = mix(shade, turfShade, turf);
        lit = mix(lit, uRockWood * (0.85 + 0.4 * val + 0.25 * mossN), hung);
        shade = mix(shade, uRockWood * vec3(0.42, 0.6, 0.72), hung);

        // ---- its light: the lit planes the sun's, the planes turned away the sky's, a clean edge between
        // (the clouds' shade only: a rock two hundred metres tall stands out of the shadow maps' depth, and was read as
        // in shadow from its foot to its top — its ledges' and its clefts' own shade is its faces turned from the sun)
        float sh = rtCloudShade(vPos);
        float ndl = dot(n, uSunDir) + turn * 0.3;
        float litK = smoothstep(-0.06, 0.14, ndl) * sh;
        float fullK = smoothstep(0.36, 0.52, ndl) * sh;
        vec3 sky = mix(uBounceColor * 2.0, uSkyColor, n.y * 0.5 + 0.5) * 0.9;
        // (the rock turned from the sun is its shade colour in the sky's light — half way to its lit colour, or it is lit
        // twice over by its own darkness and a pillar's shaded side is black)
        vec3 albedo = mix(mix(shade, lit, 0.5), lit, litK);
        vec3 col = albedo * sky * (1.0 - 0.5 * cav) + lit * uSunColor * (0.3 * litK + 0.13 * fullK) * (1.0 - 0.25 * cav);
        col += rtHeadlight(albedo, n, vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
