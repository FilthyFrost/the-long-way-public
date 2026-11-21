/**
 * The galleries of the emergent Earth's shelf roads and cliff roads (docs/V3/nodes/R7-wrapup.md; core/world/galleries.ts),
 * one mesh each, swept along the road a couple of metres at a time — the road itself is the road strip's:
 *   rock    the inner wall and the vault cut in the rock; the outer wall a row of pillars between arched windows onto
 *           the void, a sill under each; its top the rock running back into the mountainside
 *   tunnel  the same rock closed and higher, a spur of the mountain the road goes through; its vault rounder, its
 *           lamps along the crown, a portal of dressed stone at each end
 *   shed    a concrete roof on square columns, a parapet between them; over it the slope's fill (its snow)
 * Its colours are its place's rock (EarthLook.rock, rock2), the vault a shade darker; the shed's concrete and fill.
 */
import * as THREE from 'three';
import { fbm2 } from '../../core/math/noise';
import { BIOMES } from '../../core/world/biomes';
import { GALLERY_CROWN, GALLERY_INNER, GALLERY_OUTER, GALLERY_OUTER_FACE, GALLERY_SPRING, type Gallery } from '../../core/world/galleries';
import { BiomeBlend, SpineSample } from '../../core/world/spine';
import type { World } from '../../core/world/terrain';
import { ModelBuilder } from '../vehicle/builder';
import { mulberry } from './vegetation';
import { Tris } from './waterBuild';

export interface GalleryMesh {
  geometry: THREE.BufferGeometry;
  /** a tunnel's lamps, drawn unlit (null: none) */
  lamps: THREE.BufferGeometry | null;
  /** its top lies under snow: drawn with the snow cap */
  snowy: boolean;
  wx: number;
  wy: number;
  wz: number;
}

const st = new SpineSample();
const bl = new BiomeBlend();

const CONCRETE = 0xbab7ae;
const CONCRETE_DARK = 0x8a8983;
const CONCRETE_EDGE = 0xcdc9bf;
const PORTAL = 0xd3c9b3;
const PORTAL_DARK = 0xb2a892;
const LAMP = 0xffd68a;
const SNOW = 0xeef2f6;

/** a colour a shade lighter (k > 1) or darker (k < 1) */
function shade(c: number, k: number): number {
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return (ch((c >> 16) & 255) << 16) | (ch((c >> 8) & 255) << 8) | ch(c & 255);
}

/** a point of a cross-section: metres from the road's middle toward the rock (negative: toward the void), metres over the road's middle */
type UV = readonly [number, number];

export function buildGallery(world: World, g: Gallery): GalleryMesh {
  const sp = world.spine;
  sp.at(g.s0, st);
  const ox = st.x;
  const oy = st.y;
  const oz = st.z;
  sp.biomeAt((g.s0 + g.s1) / 2, bl);
  const look = BIOMES[bl.t < 0.5 ? bl.a : bl.b].earth;
  const rock = look?.rock ?? 0x9a9184;
  const rock2 = look?.rock2 ?? shade(rock, 0.86);
  const snowy = (look?.snow ?? 0) > 0.3;
  const fill = snowy ? SNOW : look ? look.ground[1] : rock2;
  // (its top is the slope's own ground, as the land beside it is painted — the rock shows only on its steep faces)
  const soil = look ? [look.ground[0], look.ground[1], look.ground[2]] : [rock, rock2, rock];
  const side = g.side;
  const rnd = mulberry(g.seed);
  /** a point of the gallery at arc length s (relative to the mesh's origin) */
  const P = (s: number, u: number, up: number): number[] => {
    sp.at(s, st);
    const d = side * u;
    return [st.x - Math.sin(st.phi) * d - ox, st.y + st.bank * d + up - oy, st.z + Math.cos(st.phi) * d - oz];
  };
  const T = new Tris();
  const b = new ModelBuilder();
  const lamps = g.kind === 'tunnel' ? new ModelBuilder() : null;
  const tunnel = g.kind === 'tunnel';
  const shed = g.kind === 'shed';
  const spring = tunnel ? 3.9 : GALLERY_SPRING;
  const crown = tunnel ? 6.6 : GALLERY_CROWN;
  // ---- the cross-sections
  const VN = 9;
  const vault: UV[] = [];
  for (let i = 0; i < VN; i++) {
    const u = -GALLERY_OUTER + ((GALLERY_INNER + GALLERY_OUTER) * i) / (VN - 1);
    const c = (GALLERY_INNER - GALLERY_OUTER) / 2;
    const hw = (GALLERY_INNER + GALLERY_OUTER) / 2;
    const q = (u - c) / hw;
    vault.push([u, shed ? 5.4 - (0.3 * (GALLERY_INNER - u)) / (GALLERY_INNER + 6.6) : spring + (crown - spring) * (1 - q * q)]);
  }
  // the top: from the outer face's lip back over the road into the mountainside, its end under the slope's rock
  const top: UV[] = shed
    ? [[-6.6, 6.3], [-2, 6.6], [2, 6.9], [GALLERY_INNER, 7.2], [9, 8.4], [13, 9.8], [17, 11.8], [19, 13.4], [21, 15.6]]
    : tunnel
      ? [[-GALLERY_OUTER_FACE, 9.0], [-4, 11.0], [0, 12.4], [5, 13.6], [10, 14.8], [15, 16.2], [20, 17.6], [24, 18.8], [28, 19.6]]
      : [[-GALLERY_OUTER_FACE, 7.0], [-5.6, 7.7], [-2, 8.6], [2, 9.5], [6, 10.6], [10, 11.6], [14, 13.0], [18, 15.0], [22, 16.4]];
  const rough = (s: number, u: number): number => (shed ? 0 : 0.9 * fbm2(s / 9, u / 6, g.seed & 0xffff, 2));
  // ---- where it is swept: a couple of metres at a time, and at the edges of its windows
  const L = g.s1 - g.s0;
  const cuts = new Set<number>();
  const n = Math.max(4, Math.round(L / 2.5));
  for (let i = 0; i <= n; i++) cuts.add(g.s0 + (L * i) / n);
  /** the windows (rock) or the bays between columns (shed): [start, end] along the road */
  const bays: [number, number][] = [];
  if (g.kind === 'rock') {
    let s = g.s0 + 5 + 3 * rnd();
    while (s < g.s1 - 9) {
      const w = 5 + 3 * rnd();
      if (s + w > g.s1 - 5) break;
      bays.push([s, s + w]);
      cuts.add(s);
      cuts.add(s + w);
      for (let q = 1; q < 4; q++) cuts.add(s + (w * q) / 4);
      s += w + 2.2 + 1.4 * rnd();
    }
  } else if (shed) {
    for (let s = g.s0 + 2.5; s + 5 < g.s1; s += 5) {
      bays.push([s + 0.45, s + 4.55]);
      cuts.add(s + 0.45);
      cuts.add(s + 4.55);
    }
  }
  const at = [...cuts].sort((p, q) => p - q);
  const bayOf = (s: number): [number, number] | null => bays.find(([a, c]) => s >= a - 1e-6 && s <= c + 1e-6) ?? null;
  const wtop = (s: number, bay: [number, number]): number => {
    const t = (s - bay[0]) / (bay[1] - bay[0]);
    return 2.9 + 1.2 * Math.sin(Math.PI * Math.max(0, Math.min(1, t)));
  };
  const strip = (color: number, a: number, c: number, p: UV, q: UV, ra = 0, rc = 0): void => {
    T.quad(color, P(a, p[0], p[1] + ra), P(a, q[0], q[1] + ra), P(c, q[0], q[1] + rc), P(c, p[0], p[1] + rc));
  };
  for (let i = 0; i + 1 < at.length; i++) {
    const a = at[i];
    const c = at[i + 1];
    const mid = (a + c) / 2;
    const bay = bayOf(mid);
    const tone = Math.floor(mid / 7) % 3 === 0 ? rock2 : rock;
    // the inner wall and the vault (a shed: its retaining wall and its slab's underside)
    strip(shed ? CONCRETE : shade(rock2, 0.9), a, c, [GALLERY_INNER, -0.6], [GALLERY_INNER, vault[VN - 1][1]]);
    for (let k = 0; k + 1 < VN; k++) strip(shed ? CONCRETE_DARK : shade(rock, 0.72), a, c, vault[k], vault[k + 1]);
    // the top, rough
    for (let k = 0; k + 1 < top.length; k++) {
      const p = top[k];
      const q = top[k + 1];
      const steep = Math.abs(q[1] - p[1]) > 0.7 * Math.abs(q[0] - p[0]);
      const col = shed ? (k < 3 ? CONCRETE_EDGE : fill) : snowy && k > 0 ? SNOW : steep || k === 0 ? tone : k < 3 ? soil[0] : soil[1];
      T.quad(col, P(a, p[0], p[1] + rough(a, p[0])), P(a, q[0], q[1] + rough(a, q[0])), P(c, q[0], q[1] + rough(c, q[0])), P(c, p[0], p[1] + rough(c, p[0])));
    }
    if (shed) {
      // the slab's outer edge; the parapet between the columns (its inner face, its top, its outer face)
      strip(CONCRETE_EDGE, a, c, [-6.6, 5.1], [-6.6, 6.3]);
      strip(CONCRETE, a, c, [-5.65, -0.4], [-5.65, 0.95]);
      strip(CONCRETE_EDGE, a, c, [-5.65, 0.95], [-6.55, 0.95]);
      strip(CONCRETE, a, c, [-6.55, 0.95], [-6.55, -1.2]);
      continue;
    }
    const lip = top[0][1];
    if (tunnel) {
      // closed: the outer wall's inner face up to the vault, its outer face a slope of rock down to the land
      strip(shade(rock2, 0.9), a, c, [-GALLERY_OUTER, -0.4], [-GALLERY_OUTER, spring]);
      strip(tone, a, c, [-GALLERY_OUTER_FACE, lip], [-11, -3]);
      continue;
    }
    if (!bay) {
      // a pillar: its inner face and its outer face, whole
      strip(shade(rock2, 0.9), a, c, [-GALLERY_OUTER, -0.4], [-GALLERY_OUTER, spring]);
      strip(tone, a, c, [-GALLERY_OUTER_FACE, -1.5], [-GALLERY_OUTER_FACE, lip]);
      continue;
    }
    // a window: the sill below (its two faces and its top), the lintel above (its two faces and the arch's soffit)
    const ta = wtop(a, bay);
    const tc = wtop(c, bay);
    strip(shade(rock2, 0.9), a, c, [-GALLERY_OUTER, -0.4], [-GALLERY_OUTER, 1.0]);
    strip(tone, a, c, [-GALLERY_OUTER_FACE, -1.5], [-GALLERY_OUTER_FACE, 1.0]);
    strip(rock2, a, c, [-GALLERY_OUTER, 1.0], [-GALLERY_OUTER_FACE, 1.0]);
    T.quad(shade(rock2, 0.9), P(a, -GALLERY_OUTER, ta), P(a, -GALLERY_OUTER, spring), P(c, -GALLERY_OUTER, spring), P(c, -GALLERY_OUTER, tc));
    T.quad(tone, P(a, -GALLERY_OUTER_FACE, ta), P(a, -GALLERY_OUTER_FACE, lip), P(c, -GALLERY_OUTER_FACE, lip), P(c, -GALLERY_OUTER_FACE, tc));
    T.quad(shade(rock2, 0.8), P(a, -GALLERY_OUTER, ta), P(a, -GALLERY_OUTER_FACE, ta), P(c, -GALLERY_OUTER_FACE, tc), P(c, -GALLERY_OUTER, tc));
  }
  // the windows' jambs: across the wall's thickness from the sill to the arch's springing
  for (const [s0, s1] of g.kind === 'rock' ? bays : []) {
    for (const s of [s0, s1]) T.quad(rock2, P(s, -GALLERY_OUTER, 1.0), P(s, -GALLERY_OUTER_FACE, 1.0), P(s, -GALLERY_OUTER_FACE, 2.9), P(s, -GALLERY_OUTER, 2.9));
  }
  // a shed's columns
  if (shed) {
    for (let s = g.s0 + 2.5; s < g.s1 - 1; s += 5) {
      const c = P(s, -6.1, 0);
      sp.at(s, st);
      b.box(c[0], c[1] + 2.25, c[2], 0.9, 5.7, 0.9, CONCRETE, { ry: -st.phi });
    }
  }
  // ---- its ends: the face between the opening and its outline (a tunnel's portal of dressed stone round the opening)
  const opening: UV[] = [[-GALLERY_OUTER, -0.4], ...vault, [GALLERY_INNER, -0.6]];
  const outline: UV[] = [[shed ? -6.6 : tunnel ? -11 : -GALLERY_OUTER_FACE, shed ? 5.1 : tunnel ? -3 : -1.5], ...top, [top[top.length - 1][0], -0.6]];
  for (const s of [g.s0, g.s1]) {
    const out = s === g.s0 ? -1 : 1;
    if (tunnel) {
      // the portal: a band of dressed stone a metre wide round the opening, standing 0.4 m proud of the rock
      const band: UV[] = opening.map(([u, up], i) => (i === 0 || i === opening.length - 1 ? [u + (i === 0 ? -1.0 : 1.0), up] : [u * 1.18, up + 1.0]));
      const sp2 = s + out * 0.4;
      for (let k = 0; k + 1 < opening.length; k++) {
        T.quad(PORTAL, P(sp2, opening[k][0], opening[k][1]), P(sp2, opening[k + 1][0], opening[k + 1][1]), P(sp2, band[k + 1][0], band[k + 1][1]), P(sp2, band[k][0], band[k][1]));
        // its reveals: outside, back to the rock's face; inside, back to the tunnel's own vault and walls
        T.quad(PORTAL_DARK, P(s, band[k][0], band[k][1]), P(s, band[k + 1][0], band[k + 1][1]), P(sp2, band[k + 1][0], band[k + 1][1]), P(sp2, band[k][0], band[k][1]));
        T.quad(PORTAL_DARK, P(s, opening[k][0], opening[k][1]), P(s, opening[k + 1][0], opening[k + 1][1]), P(sp2, opening[k + 1][0], opening[k + 1][1]), P(sp2, opening[k][0], opening[k][1]));
        T.quad(rock, P(s, band[k][0], band[k][1]), P(s, band[k + 1][0], band[k + 1][1]), P(s, outline[k + 1][0], outline[k + 1][1] + rough(s, outline[k + 1][0])), P(s, outline[k][0], outline[k][1] + rough(s, outline[k][0])));
      }
      continue;
    }
    for (let k = 0; k + 1 < opening.length; k++) {
      T.quad(shed ? CONCRETE_EDGE : rock2, P(s, opening[k][0], opening[k][1]), P(s, opening[k + 1][0], opening[k + 1][1]), P(s, outline[k + 1][0], outline[k + 1][1] + rough(s, outline[k + 1][0])), P(s, outline[k][0], outline[k][1] + rough(s, outline[k][0])));
    }
  }
  // ---- a tunnel's lamps along its crown, one every 12 m
  if (lamps) {
    for (let s = g.s0 + 6; s < g.s1 - 4; s += 12) {
      const c = P(s, 0.9, crown - 0.16);
      sp.at(s, st);
      lamps.box(c[0], c[1], c[2], 1.3, 0.12, 0.34, LAMP, { ry: -st.phi });
    }
  }
  T.into(b);
  return { geometry: b.build(), lamps: lamps ? lamps.build() : null, snowy, wx: ox, wy: oy, wz: oz };
}
