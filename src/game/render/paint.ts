/**
 * The painted palette shared by ground, grass and woods (specs/art/STYLE.md §2.3): the biome
 * paints mixed by biome weight, and the tone → paint functions.
 */
import { BIOME_COUNT } from './style';

const B = BIOME_COUNT;

/** sum over biomes of arr[b * n + i] * w[b] */
function mixPal(arr: string, n: number, i: number): string {
  const terms: string[] = [];
  for (let b = 0; b < B; b++) terms.push(`${arr}[${b * n + i}] * bw[${b}]`);
  return terms.join(' + ');
}

/**
 * GLSL: weights of the palette slots. Vertices carry them outright; instances (a tree, a tuft)
 * carry the two slots of their spot and the share of the second, since a single point never
 * needs more.
 */
export const GLSL_SLOTS = /* glsl */ `
  vec4 rtSlotW(float a, float b, float t) {
    vec4 s = vec4(0.0, 1.0, 2.0, 3.0);
    return (1.0 - t) * vec4(equal(vec4(floor(a + 0.5)), s)) + t * vec4(equal(vec4(floor(b + 0.5)), s));
  }
  // the same from one packed number: a + 4 b
  vec4 rtSlotPair(float packed, float t) {
    float pk = floor(packed + 0.5);
    float b = floor(pk / 4.0);
    return rtSlotW(pk - 4.0 * b, b, t);
  }
`;

export const GLSL_PAINT = /* glsl */ `
  struct RtPal {
    vec3 deep; vec3 mid; vec3 lit;
    vec3 dry; vec3 warm; vec3 cool; vec3 farLift;
    vec3 f0; vec3 f1; vec3 f2; vec3 f3;
    vec3 rockLit; vec3 rockShade;
    vec3 fl0; vec3 fl1; vec3 fl2;
    vec4 misc;            // x snow, y dryness, z grass density, w layered rock
    float rockStart;
    float variety;        // autumn: how far the woods are turned
    float terrace;        // how fully the slopes here are cut into benches (0: no terraces)
    float terraceStep;    // the height between two benches (m)
  };
  RtPal rtPal(vec4 bwIn) {
    float bw[${B}];
    ${Array.from({ length: B }, (_, b) => `bw[${b}] = bwIn[${b}];`).join(' ')}
    RtPal p;
    p.deep = ${mixPal('uGroundPal', 3, 0)};
    p.mid = ${mixPal('uGroundPal', 3, 1)};
    p.lit = ${mixPal('uGroundPal', 3, 2)};
    p.dry = ${mixPal('uDryPal', 1, 0)};
    p.warm = ${mixPal('uWarmPal', 1, 0)};
    p.cool = ${mixPal('uCoolPal', 1, 0)};
    p.farLift = ${mixPal('uFarLiftPal', 1, 0)};
    p.f0 = ${mixPal('uForestPal', 4, 0)};
    p.f1 = ${mixPal('uForestPal', 4, 1)};
    p.f2 = ${mixPal('uForestPal', 4, 2)};
    p.f3 = ${mixPal('uForestPal', 4, 3)};
    p.rockLit = ${mixPal('uRockLitPal', 1, 0)};
    p.rockShade = ${mixPal('uRockShadePal', 1, 0)};
    p.fl0 = ${mixPal('uFlowerPal', 3, 0)};
    p.fl1 = ${mixPal('uFlowerPal', 3, 1)};
    p.fl2 = ${mixPal('uFlowerPal', 3, 2)};
    p.misc = ${Array.from({ length: B }, (_, b) => `uBiomeMisc[${b}] * bw[${b}]`).join(' + ')};
    p.rockStart = ${Array.from({ length: B }, (_, b) => `uBiomeMisc2[${b}].x * bw[${b}]`).join(' + ')};
    p.variety = ${Array.from({ length: B }, (_, b) => `uBiomeMisc2[${b}].y * bw[${b}]`).join(' + ')};
    p.terrace = ${Array.from({ length: B }, (_, b) => `uBiomeMisc2[${b}].z * bw[${b}]`).join(' + ')};
    p.terraceStep = (${Array.from({ length: B }, (_, b) => `uBiomeMisc2[${b}].w * bw[${b}]`).join(' + ')}) / max(p.terrace, 1e-4);
    return p;
  }
  vec3 rtPaintTone(RtPal p, float tone) {
    vec3 c = mix(p.deep, p.mid, smoothstep(0.18, 0.48, tone));
    return mix(c, p.lit, smoothstep(0.55, 0.88, tone));
  }
  // (G2) the four tones of a crown from its key: Painted Valley's ladder channel by channel (core/world/earth/palette.ts
  // crownLadder, the same numbers) — a plant with a colour of its own beside one in its region's woods, one ladder
  vec3 rtLadder(vec3 key, float tone) {
    float g = clamp((key.g - key.r) / max(key.g, 1e-3) * 2.0, 0.0, 1.0);
    vec3 f0 = key * mix(vec3(0.3, 0.24, 0.45), vec3(0.14, 0.28, 0.83), g);
    vec3 f1 = key * mix(vec3(0.55, 0.5, 0.7), vec3(0.35, 0.556, 1.0), g);
    // (a shade is a deep teal at its bluest, never a blue: a spruce's key is half blue already)
    f0.b = min(f0.b, f0.g * 1.02);
    f1.b = min(f1.b, f1.g * 0.72);
    vec3 f3 = key * mix(vec3(1.6, 1.5, 1.2), vec3(3.0, 1.56, 1.25), g);
    vec3 c = mix(f0, f1, smoothstep(0.26, 0.4, tone));
    c = mix(c, key, smoothstep(0.52, 0.66, tone));
    return mix(c, f3, smoothstep(0.8, 0.92, tone));
  }
  vec3 rtWoodTone(RtPal p, float tone) {
    vec3 c = mix(p.f0, p.f1, smoothstep(0.26, 0.4, tone));
    c = mix(c, p.f2, smoothstep(0.52, 0.66, tone));
    return mix(c, p.f3, smoothstep(0.8, 0.92, tone));
  }
  // snow is painted the same way: blue in the shade, white in the light
  vec3 rtSnowTone(float tone) {
    return mix(vec3(0.4, 0.5, 0.78), vec3(0.95, 0.96, 1.0), smoothstep(0.22, 0.72, tone));
  }
`;
