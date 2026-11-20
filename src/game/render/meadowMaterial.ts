/**
 * The meadow's blades (scene/meadow.ts): Painted Valley's grass (lib/blades.js, MIT: THIRD-PARTY-NOTICES.md)
 * grown on this world's ground and painted in its paint. Nothing about a blade is stored: where it stands, how tall
 * it is, which way it leans come from the number of the world cell it grows in, so the same blade is there when one
 * comes back; how much grass grows there, how tall, whether it is a lawn, a verge, a shore, and the palette it is
 * painted from come from the meadow's map (scene/meadow.ts MeadowMap), the 2 m samples a grass tile has always
 * read (worldBuild.ts meadowSample). A blade is a strip of a few rows bent in an arc, turned partly to face the
 * eye; far out a blade is a few wider ones together, a tuft, whose tops one mostly sees.
 *
 * Its paint is the ground's where it stands (terrainMaterials.ts rtPaintedGround: the slope to the sun, the
 * brushwork by its distance, the slow tone, the warm and cool patches, the dry patches and the verge, the woods'
 * shade), so that the blades and the ground between them are one paint and the farthest tufts go into the ground's
 * own; near the eye a blade adds its clump's tone, one in twenty a darker stroke and one in thirty a lighter.
 */
import { SNOW_FIELD } from './seasonalSnow';
import * as THREE from 'three';
import { GLSL_PAINT, GLSL_SLOTS } from './paint';
import { GLSL_COMMON, globals } from './shaderlib';
import { coverUniforms } from './style';

/** a ring of blades (scene/meadow.ts RINGS) as the material needs it */
export interface MeadowRingLook {
  /** metres between blades */
  cell: number;
  /** rows of vertices up a blade */
  rows: number;
  /** fade: in from, to; out from, to (m from the eye; a negative second number: no fade in) */
  fade: readonly [number, number, number, number];
  /** how wide a blade is against a near one's */
  width: number;
  /** 0 for single blades; more where a blade stands for many and one mostly sees their tops */
  tops: number;
  salt: number;
  /** the ring's tile (m a side) and its tiles a side: a ring is drawn in one call, its tiles in view in uTiles */
  tile: number;
  tiles: number;
}

/** a whole number below n² and prime to it, near n²'s golden share: the order a ring's cells are drawn in */
export function cellScramble(nn: number): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  let a = Math.max(1, Math.round(nn * 0.618));
  while (gcd(a, nn) !== 1) a++;
  return a;
}

/** the meadow's map: texels a side (scene/meadow.ts MEADOW_N), metres between samples */
export const MEADOW_MAP = { n: 144, spacing: 2 } as const;
/** the map's 8-bit channels hold these at full (scene/meadow.ts writes them so) */
export const MEADOW_SCALE = { ad: 10.2, grow: 1.25, tall: 1.2, shore: 1.25 } as const;

/** the uniforms every ring shares: the map and where it lies, the render origin's height, how much grass is drawn */
export const meadowUniforms = {
  /** per sample: the ground's height, and the palette pair + 0.98 × the share of b (+ 16 where bare) */
  tMeadowA: { value: null as THREE.Texture | null },
  /** per sample, 8 bits each: road distance, how much grows, how tall, how mown */
  tMeadowB: { value: null as THREE.Texture | null },
  /** per sample, 8 bits each: towards a shore, the old road's weeds, the woods */
  tMeadowC: { value: null as THREE.Texture | null },
  /** render-space position of the map's first sample, and which texel holds it */
  uMapOrigin: { value: new THREE.Vector2() },
  uMapBase: { value: new THREE.Vector2() },
  uOriginY: { value: 0 },
  uDensity: { value: 1 },
  /** the world's heights less this are metres above the sea (core/world/spine.ts lift) */
  uLift: { value: 0 },
};

const f1 = (v: number): string => v.toFixed(4);

export function meadowMaterial(ring: MeadowRingLook): THREE.ShaderMaterial {
  const N = MEADOW_MAP.n;
  const S = MEADOW_SCALE;
  const per = Math.round(ring.tile / ring.cell);
  const tiles = ring.tiles * ring.tiles;
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: {
      ...globals,
      ...meadowUniforms,
      uCoverMisc: coverUniforms.uCoverMisc,
      uOriginCell: { value: new THREE.Vector2() },
      // the ring's tiles in view, their corners in render space (scene/meadow.ts), and the blades drawn in each
      uTiles: { value: Array.from({ length: tiles }, () => new THREE.Vector2()) },
      uPer: { value: per * per },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${GLSL_COMMON}
      ${GLSL_SLOTS}
      uniform vec2 uTiles[${tiles}];
      uniform int uPer;
      uniform sampler2D tMeadowA;
      uniform sampler2D tMeadowB;
      uniform sampler2D tMeadowC;
      uniform vec2 uMapOrigin;
      uniform ivec2 uMapBase;
      uniform float uOriginY;
      uniform float uDensity;
      uniform float uLift;
      ${SNOW_FIELD}
      uniform vec4 uCoverMisc[4];
      uniform ivec2 uOriginCell;
      varying vec3 vPos;
      varying vec4 vBw;
      varying float vTip;
      varying float vUp;
      varying float vTone;
      varying vec4 vPatch;    // warm, cool, dry-patch noise, the verge's dust
      varying vec4 vMisc;     // lawn, woods, light among the clumps × the slope's sun, straw of its own
      #define CELL ${f1(ring.cell)}
      #define ROWS ${ring.rows.toFixed(1)}
      #define TOPS ${f1(ring.tops)}
      #define WIDTH ${f1(ring.width)}
      #define SALT ${ring.salt}
      #define MAP_N ${N}
      #define MAP_NF ${N.toFixed(1)}
      #define NPER ${per}
      #define NN ${per * per}
      #define SCRAMBLE ${cellScramble(per * per)}

      uvec3 rtPcg3(uvec3 v) {
        v = v * 1664525u + 1013904223u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        v ^= v >> 16u;
        v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
        return v;
      }
      // four numbers of a cell of the world, the same every frame and on every machine
      vec4 rtCellRand(ivec2 cell, int salt) {
        uvec3 a = rtPcg3(uvec3(uint(cell.x), uint(cell.y), uint(salt)));
        uvec3 b = rtPcg3(a + 7u);
        return vec4(vec3(a >> 8u), float(b.x >> 8u)) / 16777216.0;
      }
      // where a seed stalk's rows sit: most of them in its head
      float stalkRow(float t) {
        float k = t * (ROWS - 1.0);
        if (ROWS > 6.5) {
          float r[8] = float[8](0.0, 0.3, 0.55, 0.74, 0.8, 0.87, 0.94, 1.0);
          return r[int(k + 0.5)];
        }
        if (ROWS > 3.5) {
          float r[4] = float[4](0.0, 0.76, 0.88, 1.0);
          return r[int(k + 0.5)];
        }
        return t;
      }
      void dead() {
        gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }

      void main() {
        float side = position.x;
        float t = position.y;
        float sub = position.z;
        // the cell it grows in: the tile's, counted from the render origin (which moves in whole steps of 256 m, a
        // whole number of every ring's cells), and so the world's
        // (the ring is drawn in one call: its tiles in view are listed in uTiles, uPer blades each, and a blade's number
        // says its tile and its cell there — the c-th of the tile's cells in a scrambled order, so that a ring drawn
        // thinner still draws cells spread over all of it)
        int slot = gl_InstanceID / uPer;
        int c = gl_InstanceID - slot * uPer;
        int cell = (c * SCRAMBLE) % NN;
        ivec2 lc = ivec2(floor(uTiles[slot] / CELL + 0.5)) + ivec2(cell % NPER, cell / NPER);
        ivec2 wc = lc + uOriginCell;
        int salt = SALT + int(sub) * 7;
        vec4 r = rtCellRand(wc, salt);
        vec4 q = rtCellRand(wc, salt + 31);
        vec2 xz = (vec2(lc) + r.xy) * CELL;
        float dist = distance(xz, cameraPosition.xz);
        // each blade leaves its ring and comes into the next at a distance of its own, so nothing pops
        vec4 fade = vec4(${ring.fade.map((v) => v.toFixed(2)).join(', ')});
        float keep = (fade.y < 0.0 ? 1.0 : smoothstep(fade.x, fade.y, dist)) * (1.0 - smoothstep(fade.z, fade.w, dist));
        float live = smoothstep(0.0, 0.18, keep - q.x * 0.82);
        if (live <= 0.0) { dead(); return; }

        // ---- the map where it stands: the four samples round it
        vec2 mp = (xz - uMapOrigin) * 0.5;
        if (mp.x < 0.0 || mp.y < 0.0 || mp.x >= MAP_NF - 1.0 || mp.y >= MAP_NF - 1.0) { dead(); return; }
        ivec2 i0 = ivec2(floor(mp));
        vec2 f = mp - vec2(i0);
        ivec2 a = (uMapBase + i0) % MAP_N;
        ivec2 b = (a + 1) % MAP_N;
        vec2 A00 = texelFetch(tMeadowA, a, 0).rg;
        vec2 A10 = texelFetch(tMeadowA, ivec2(b.x, a.y), 0).rg;
        vec2 A01 = texelFetch(tMeadowA, ivec2(a.x, b.y), 0).rg;
        vec2 A11 = texelFetch(tMeadowA, b, 0).rg;
        // (none where a sample round it is bare: the tiles' grid, interpolated, above 0.01 — worldBuild.ts grassSlices)
        vec4 bare = step(15.5, vec4(A00.g, A10.g, A01.g, A11.g));
        if (mix(mix(bare.x, bare.y, f.x), mix(bare.z, bare.w, f.x), f.y) > 0.01) { dead(); return; }
        float gy = mix(mix(A00.r, A10.r, f.x), mix(A01.r, A11.r, f.x), f.y) - uOriginY;
        // (the palette slots are whole numbers: the nearest sample's)
        float pk = f.y < 0.5 ? (f.x < 0.5 ? A00.g : A10.g) : (f.x < 0.5 ? A01.g : A11.g);
        float pair = floor(pk);
        vec2 uvB = (vec2(uMapBase) + mp + 0.5) / MAP_NF;
        vec4 B = texture2D(tMeadowB, uvB);
        vec4 C = texture2D(tMeadowC, uvB);
        float ad = B.r * ${f1(S.ad)};
        float tall = B.b * ${f1(S.tall)};
        float mow = B.a;
        float shore = C.r * ${f1(S.shore)};
        float wood = C.b;

        // ---- how much grows: on the old road its weeds — in the shoulder, along the pavement's edge, up the crack
        // down the middle — else the cover's grass, thinner on the verge (worldBuild.ts grassSlices)
        bool onRoad = ad < 4.9;
        float grow = onRoad ? (ad > 3.25 ? 0.62 : ad > 2.8 ? 0.22 : ad > 2.55 ? 0.08 : ad < 0.28 ? 0.1 : 0.01) * C.g * 0.45
                            : B.g * ${f1(S.grow)} * (0.6 + 0.4 * smoothstep(4.9, 9.0, ad));
        vec2 w = xz + uOriginOffset.xz;
        // neighbours share a look: a clump of some 0.44 m, its edge broken up blade by blade
        vec4 cl = rtHash4(floor((w + (r.zw - 0.5) * 0.34) / 0.44) + 0.5);
        // (the old road's weeds stand in clumps in its cracks, not one by one)
        if (onRoad) grow *= smoothstep(0.4, 0.62, cl.g) * 2.2;
        // the ground where it stands: its slope, its brushwork and slow tone (its paint, below), its palette slots
        vec2 grad = vec2(mix(A10.r - A00.r, A11.r - A01.r, f.y), mix(A01.r - A00.r, A11.r - A10.r, f.x)) * 0.5;
        vec3 nGround = normalize(vec3(-grad.x, 1.0, -grad.y));
        float s6 = rtStrokeAt(w, 6.0) - 0.5;
        float s27 = rtStrokeAt(w + vec2(17.0, 5.0), 27.0) - 0.5;
        float s95 = rtStrokeAt(w + vec2(-41.0, 73.0), 95.0) - 0.5;
        vec4 nz = rtNoiseAt(w, 640.0);
        vec4 bw = rtSlotPair(pair, (pk - pair) / 0.98);
        // above the region's snow line the ground is snow (terrainMaterials.ts: the same line, as ragged, on the
        // gentler faces first): only a stalk here and there stands through it
        vec2 lines = uCoverMisc[0].zw * bw.x + uCoverMisc[1].zw * bw.y + uCoverMisc[2].zw * bw.z + uCoverMisc[3].zw * bw.w;
        float steep = 1.0 - nGround.y;
        float snowy = rtSeasonSnow(gy + uOriginY - uLift, bw);
        grow *= 1.0 - smoothstep(lines.y - 80.0, lines.y, gy + uOriginY - uLift);
        // (where the ground is half snow already, as good as none: the blades would stand pale on white)
        grow *= 1.0 - 0.95 * smoothstep(0.1, 0.55, snowy);
        // (and in snowy country — its ground painted snow, whatever the height — and where snow has fallen, it lies
        // over the meadow as over the ground: a stalk pokes through here and there)
        grow *= 1.0 - 0.9 * smoothstep(0.15, 0.7, uWeather.y * smoothstep(0.55, 0.85, nGround.y));
        live *= smoothstep(0.0, 0.1, grow * uDensity - q.y);
        if (live <= 0.0) { dead(); return; }
        float lawn = mow < 1.0 ? min(1.0, (1.0 - mow) / 0.6) : 0.0;
        float dryN = rtNoiseAt(w + 500.0, 120.0).a;
        bool stalk = ROWS > 3.5 && !onRoad && lawn < 0.01 && q.w < 0.012 + 0.045 * smoothstep(0.4, 0.75, dryN);

        // ---- how tall: the clump, the blade, broad patches of long deep grass and short sunlit grass (where the
        // ground's brushwork is darker and lighter), a lawn mown even, short by the road and towards a shore
        float h = tall * 1.2 * mix(0.5, 1.0, cl.r) * mix(0.7, 1.22, r.z) * mix(0.55, 1.0, live);
        float patchT = s27 * 0.7 + s95 * 0.9;
        float tallAt = mix(0.72, 1.5, smoothstep(0.34, 0.68, rtNoiseAt(w + 11.0, 23.0).b * 0.7 + rtNoiseAt(w + 0.8, 7.0).r * 0.3));
        h *= tallAt * mix(1.32, 0.78, clamp(0.5 + patchT * 1.5, 0.0, 1.0));
        if (stalk) h *= 1.5;
        h = mix(h, tall * 1.2 * mix(0.9, 1.1, r.z), 0.8 * lawn) * (lawn > 0.0 ? mow : 1.0);
        h *= (onRoad ? 0.55 : 0.6 + 0.4 * smoothstep(4.9, 10.0, ad)) * (1.0 - 0.55 * shore);
        h *= 1.0 + 0.3 * TOPS;

        // ---- which way it leans: a meadow is combed one way, each clump and blade a little its own; the wind
        // leans it further in the gusts, and it flutters
        float comb = (rtNoiseAt(w, 60.0).g - 0.5) * 4.8;
        float yaw = comb + (cl.b - 0.5) * 1.8 + (r.w - 0.5) * 1.6;
        vec2 L = vec2(cos(yaw), sin(yaw)) * mix(0.22, 0.85, q.z) * (stalk ? 0.3 : 1.0);
        float gust = smoothstep(0.26, 0.78, rtNoiseAt(w * 0.5 - uWind.xy * uWind.w, 60.0).b);
        float U = uWind.z * 12.0;
        float flutter = sin(r.w * 40.0 + uTime * (5.0 + 4.0 * r.z)) * (0.028 + 0.013 * U);
        L += uWind.xy * (U * mix(0.028, 0.105, gust) + flutter * 0.6) + vec2(-uWind.y, uWind.x) * flutter * 0.5;
        L += vec2(sin(uTime * 0.7 + r.x * 30.0), cos(uTime * 0.6 + r.y * 30.0)) * 0.03;
        float lean = length(L);
        vec2 dir = L / max(lean, 1e-4);
        lean = min(lean, 1.5);
        float theta0 = lean * 0.25;
        float A = lean - theta0;

        // ---- the blade: an arc from its foot, tapering to the tip; a seed stalk thin, with its head
        float s = stalk ? stalkRow(t) : t;
        float wd = WIDTH * 0.0115 * mix(0.72, 1.3, r.x) * (WIDTH < 1.5 ? 2.1 : WIDTH < 3.0 ? 1.45 : 1.0);
        if (stalk) wd *= s < 0.78 ? 0.22 : 0.22 + 0.62 * sin(3.14159 * (s - 0.78) / 0.22);
        else wd *= min(1.0, (1.0 - s) * 3.2) * (0.72 + 0.28 * (1.0 - s));
        wd *= mix(0.5, 1.0, live);
        float phi = theta0 + A * s;
        float along = A > 1e-3 ? h * (cos(theta0) - cos(phi)) / A : h * s * sin(theta0);
        float rise = A > 1e-3 ? h * (sin(phi) - sin(theta0)) / A : h * s * cos(theta0);
        vec3 tangent = vec3(dir.x * sin(phi), cos(phi), dir.y * sin(phi));
        vec3 across = vec3(-dir.y, 0.0, dir.x);
        vec3 base = vec3(xz.x, gy - 0.03, xz.y);
        // turned partly to face the eye, so a blade seen edge on does not vanish
        vec3 facing = cross(tangent, normalize(cameraPosition - base));
        float fl = length(facing);
        if (fl > 1e-3) {
          facing /= fl;
          across = normalize(mix(across, facing * (dot(facing, across) < 0.0 ? -1.0 : 1.0), 0.68));
        }
        vec3 p = base + vec3(dir.x * along, rise, dir.y * along) + across * side * wd * 0.5;

        // ---- its paint: the ground's where it stands, then its own
        float rel = mix(0.5, rtSlopeRel(nGround), mix(0.15, 1.0, smoothstep(6.0, 18.0, ad)));
        float brush = (s6 * 0.6 * (1.0 - smoothstep(22.0, 55.0, dist))
                    + s27 * 0.5 * (1.0 - smoothstep(70.0, 220.0, dist))
                    + s95 * 0.42 * (1.0 - smoothstep(260.0, 900.0, dist))) * (1.0 - 0.3 * lawn);
        float tone = rel + brush + (nz.r - 0.5) * 0.28 - wood * 0.22;
        // (near, the meadow lies in broad patches of light short grass and deep long grass — the brushwork again, as
        // much once more, and a little lighter; further out it is the ground's own, where the blades go into it)
        float near = 1.0 - smoothstep(60.0, 110.0, dist);
        tone += ((s6 * 0.5 + patchT) * 0.55 + 0.06) * near;
        // (its own: the clump's tone, a darker stroke now and then and a lighter, lighter in a gust; less of it
        // further off, where the blades go into the ground's paint)
        float own = (cl.a - 0.5) * 0.16 + (q.z < 0.05 ? -0.26 : q.z > 0.967 ? 0.18 : 0.0) + 0.1 * gust * min(U / 6.0, 1.0);
        tone += own * mix(0.35, 1.0, 1.0 - smoothstep(25.0, 70.0, dist));
        // the grass nearest the eye is the picture's foreground, a tone deeper
        tone -= 0.2 * (1.0 - smoothstep(1.5, 9.0, dist));
        vTone = tone;
        float sc = mix(s, 1.0, TOPS);
        vTip = sc;
        vUp = max(clamp(rise / max(tall * 1.2 * 0.85, 0.05), 0.0, 1.0), TOPS * 1.2);
        // patches as the ground has them, the dry patches' noise, the verge's dust
        float mid = 0.75 + 0.35 * smoothstep(40.0, 160.0, dist);
        float warm = smoothstep(0.52, 0.64, rtNoiseAt(w + 13.0, 300.0).g);
        float cool = smoothstep(0.52, 0.63, rtNoiseAt(w * vec2(1.0, 0.7) + 71.0, 210.0).b);
        vPatch = vec4(warm * 0.9 * mid, cool * (0.8 - 0.45 * warm) * mid, dryN, (1.0 - smoothstep(4.0, 6.0, ad + (nz.g - 0.5) * 3.0)) * 0.4);
        // a low sun lights the tall clumps and leaves the short ones among them in shade; a hollow is lit by the sky
        float among = mix(mix(0.45, 1.0, smoothstep(0.15, 0.75, cl.r)), 1.0, clamp(uSunDir.y * 2.5, 0.0, 1.0));
        float straw = max(stalk ? smoothstep(0.75, 0.82, s) * 0.9 : (q.w > 0.94 ? 0.7 : 0.0), max(snowy, uWeather.y) * 0.85);
        vMisc = vec4(lawn, wood, among * rtSlopeSun(rel), straw);
        vBw = bw;
        vec4 wp = vec4(p, 1.0);
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
      varying float vTip;
      varying float vUp;
      varying float vTone;
      varying vec4 vPatch;
      varying vec4 vMisc;
      void main() {
        #include <logdepthbuf_fragment>
        RtPal p = rtPal(vBw);
        p.deep = mix(p.deep, vec3(0.105, 0.13, 0.084), p.misc.x);
        p.mid = mix(p.mid, vec3(0.26, 0.29, 0.17), p.misc.x);
        p.lit = mix(p.lit, vec3(0.49, 0.48, 0.29), p.misc.x);
        float lawn = vMisc.x;
        float sh = rtShadow(vPos, vec3(0.0, 1.0, 0.0));
        float tone = vTone + (vTip - 0.5) * 0.28 - (1.0 - sh) * 0.22;
        vec3 albedo = rtPaintTone(p, tone);
        albedo *= mix(vec3(1.0), p.warm, vPatch.x);
        albedo *= mix(vec3(1.0), p.cool, vPatch.y);
        // dry ground as the ground has it — the country's dryness in patches, the dusty verge — and a blade gone to
        // straw now and then, a seed stalk's head; a lawn kept fresh
        float dryField = smoothstep(0.45, 0.7, vPatch.z + (p.misc.y - 0.5) * 0.9);
        float dryAmt = clamp(max(dryField * (0.35 + 0.5 * p.misc.y), vPatch.w) * (1.0 - vMisc.y) * (1.0 - 0.75 * lawn), 0.0, 1.0);
        albedo = mix(albedo, p.dry * mix(0.62, 1.12, smoothstep(0.2, 0.8, tone)), dryAmt);
        float straw = max(clamp(p.misc.y * 0.8, 0.0, 1.0) * vTip, vMisc.w) * (1.0 - 0.85 * lawn);
        albedo = mix(albedo, p.dry * mix(0.8, 1.35, vTip), straw);
        albedo = mix(albedo, albedo * vec3(0.92, 1.08, 0.8), lawn * 0.45);
        albedo *= mix(vec3(1.0), vec3(1.1, 1.05, 0.8), vTip * 0.45);
        vec2 w = rtWorldXZ(vPos);
        float snow = uWeather.y * smoothstep(0.2, 0.7, vTip + (rtFbm(w, 16.0) - 0.5) * 0.3);
        albedo = mix(albedo, rtSnowTone(tone), clamp(snow, 0.0, 1.0) * 0.8);
        albedo *= 1.0 - 0.18 * uWeather.x;
        // down among the blades the sun does not reach: the roots are lit by the sky
        vec3 col = albedo * rtGroundLight(sh * vMisc.z * mix(0.35, 1.0, smoothstep(0.0, 0.7, vUp)));
        // light through the blades when the sun is behind them
        vec3 v = normalize(vPos - cameraPosition);
        float back = pow(max(dot(v, uSunDir), 0.0), 3.0) * vTip;
        col += albedo * uSunColor * vec3(0.5, 0.45, 0.2) * back * sh;
        col += rtHeadlight(albedo, vec3(0.0, 1.0, 0.0), vPos);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/**
 * A tile of a ring: its blades' cells within it, shuffled, so drawing fewer of them thins the grass evenly
 * (`instanceCount`), each blade a strip of `rows` rows of two vertices; `sub` blades to a cell.
 */
export function meadowRingGeometry(ring: { rows: number; sub: number; tile: number; cell: number }, random: () => number): { geometry: THREE.InstancedBufferGeometry; count: number } {
  const { rows, sub, tile, cell } = ring;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let b = 0; b < sub; b++) {
    const first = positions.length / 3;
    for (let j = 0; j < rows; j++) {
      const t = j / (rows - 1);
      positions.push(-1, t, b, 1, t, b);
      if (j < rows - 1) {
        const a = first + j * 2;
        indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
      }
    }
  }
  // (a blade's cell is found from its instance's number in the shader: the geometry is one blade, drawn as many times
  // as there are cells in the tiles in view)
  void random;
  const n = Math.round(tile / cell);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.instanceCount = 0;
  return { geometry, count: n * n };
}
