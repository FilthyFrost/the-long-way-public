/**
 * The vents of a geothermal place (V5, docs/V3/nodes/V5-landforms.md): its hot springs, fumaroles, mud pots and the
 * geyser, along its stretch of the road — every 170 m or so, now on one side, now the other, 24 to 134 m off it, on
 * ground not too steep for a spring's apron and dry, not on a place by the road; the vent nearest the stretch's middle
 * with room for it and in sight of the road the geyser. Deterministic by the world's seed and the place's index, the
 * same whoever asks: the woods keep clear of them (flora.ts) and the scene draws them (game/scene/geothermal.ts).
 */
import type { SpineSample } from '../spine';
import type { TerrainPoint, World } from '../terrain';
import type { EarthPiece } from './road';

/** a vent's kind: a hot spring, a fumarole, the geyser, a mud pot */
export const POOL = 0;
export const FUMAROLE = 1;
export const GEYSER = 2;
export const MUD = 3;

export interface Vent {
  kind: number;
  x: number;
  y: number;
  z: number;
  /** its spring's or its mound's radius (m) */
  r: number;
  seed: number;
  /** the road's distance beside it, and which side and how far off (m: + right) */
  s: number;
  off: number;
}

/** how far a spring's apron reaches, in its radii; the woods keep a little further off */
export const APRON = 1.32;
const CLEAR = 1.5;

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** is a place a geothermal field */
export function isGeothermal(p: EarthPiece): boolean {
  return p.kind === 'scene' && p.scene?.place.look.landform.id === 'geothermal';
}

const SPACING = 170;

function plan(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): Vent[] {
  const out: Vent[] = [];
  const key = (world.seed | 0) ^ Math.imul(p.index + 1, 0x51ed27);
  const n = Math.floor((p.end - p.start) / SPACING);
  const mid = (p.start + p.end) / 2;
  let geyser = -1;
  let best = Infinity;
  for (let i = 1; i < n; i++) {
    if (hash(key, i * 7) > 0.88) continue;
    const s = p.start + (i + 0.6 * (hash(key, i * 7 + 1) - 0.5)) * SPACING;
    world.spine.at(s, st);
    const side = hash(key, i * 7 + 2) < 0.5 ? -1 : 1;
    const off = 24 + 110 * hash(key, i * 7 + 3) ** 2;
    const x = st.x - Math.sin(st.phi) * side * off;
    const z = st.z + Math.cos(st.phi) * side * off;
    const k = hash(key, i * 7 + 4);
    const kind = k < 0.56 ? POOL : k < 0.84 ? FUMAROLE : MUD;
    const r = kind === POOL ? 4.5 + 11 * hash(key, i * 7 + 5) ** 1.5 : kind === FUMAROLE ? 3 + 2 * hash(key, i * 7 + 5) : 2.5 + 3 * hash(key, i * 7 + 5);
    world.shape(x, z, tp);
    if (tp.zone || tp.site > 0.05 || tp.plot > 0.05 || tp.wl > tp.bed - 0.2 || Math.abs(tp.d) < 18 + r) continue;
    const y = tp.bed;
    // (a geothermal field is low hills, and a spring on a hillside spills down it: its apron lies over the land as it is
    // — but not over a bank)
    let lo = y;
    let hi = y;
    for (let a = 0; a < 6; a++) {
      world.shape(x + Math.cos(a * 1.047) * r * APRON, z + Math.sin(a * 1.047) * r * APRON, tp);
      if (tp.wl > tp.bed - 0.2) hi = Infinity;
      lo = Math.min(lo, tp.bed);
      hi = Math.max(hi, tp.bed);
    }
    if (hi - lo > 0.9 * r + 2) continue;
    out.push({ kind, x, y, z, r, seed: hash(key, i * 7 + 6), s, off: off * side });
    if (kind !== MUD && off < 70 && Math.abs(s - mid) < best) {
      best = Math.abs(s - mid);
      geyser = out.length - 1;
    }
  }
  if (geyser >= 0) {
    const g = out[geyser];
    g.kind = GEYSER;
    g.r = Math.max(g.r, 7);
  }
  return out;
}

const cache = new WeakMap<World, Map<number, Vent[]>>();

/** a place's vents (none if it is not a geothermal field), planned the first time asked, the same after */
export function ventsOf(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): readonly Vent[] {
  if (!isGeothermal(p)) return [];
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  let v = m.get(p.index);
  if (!v) m.set(p.index, (v = plan(world, p, tp, st)));
  return v;
}

const none: readonly Vent[] = [];

/**
 * The vents within reach of a point (the woods' tiles ask, flora.ts): those of the geothermal places whose stretch
 * of the road the point lies beside. `sAt` the road's distance of the point.
 */
export function ventsNear(world: World, sAt: number, x: number, z: number, reach: number, tp: TerrainPoint, st: SpineSample): readonly Vent[] {
  const earth = world.earth;
  if (!earth) return none;
  let out: Vent[] | null = null;
  const ps = earth.pieces;
  // (the piece the point is beside, and its neighbours: the pieces are in order along the road)
  let lo = 0;
  let hi = ps.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (ps[m].start <= sAt) lo = m;
    else hi = m - 1;
  }
  for (let i = Math.max(0, lo - 1); i <= Math.min(ps.length - 1, lo + 1); i++) {
    const p = ps[i];
    if (p.end < sAt - 400 || p.start > sAt + 400 || !isGeothermal(p)) continue;
    for (const v of ventsOf(world, p, tp, st)) {
      if (Math.hypot(v.x - x, v.z - z) < reach + v.r * CLEAR) (out ??= []).push(v);
    }
  }
  return out ?? none;
}

/** is (x, z) inside a vent's clearing (the woods keep out of it) */
export function inVentClearing(vents: readonly Vent[], x: number, z: number): boolean {
  for (const v of vents) if (Math.hypot(v.x - x, v.z - z) < v.r * CLEAR + 2) return true;
  return false;
}
