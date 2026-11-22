/**
 * A place's glacier (V9, docs/V3/nodes/V9-heroes.md): "蓝色的冰舌从山口伸下来" its moment, and a glacier's valley was
 * a valley like any other, snow on its tops. Now a glacier place has its tongues of ice coming down out of the
 * mountains toward the road: every TRY m or so along its stretch the longest rise of the land from near the road
 * up to well above it is walked out — a valley's head, a side valley, a steep slope — and the ice lies down it from
 * there to its snout a few hundred metres from the road: wide up in the snow, narrowing toward its foot, its snout
 * rounded. By the world's seed and the place's index, the same whoever asks (game/scene/glaciers.ts draws them).
 */
import type { SpineSample } from '../spine';
import type { TerrainPoint, World } from '../terrain';
import type { EarthPiece } from './road';

export interface Glacier {
  /** the arc length of the road beside it (m) */
  s: number;
  /** its middle line from its source down to its snout: x, y (the land there), z of each point (m) */
  path: number[];
  /** its width at its source and at its snout (m) */
  w0: number;
  w1: number;
  seed: number;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x61c88647, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

const TRY = 900;
const STEP = 25;

function plan(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): Glacier[] {
  const out: Glacier[] = [];
  const key = (world.seed | 0) ^ Math.imul(p.index + 17, 0x165667b1);
  const n = Math.floor((p.end - p.start) / TRY);
  for (let i = 0; i < n; i++) {
    const q = (j: number): number => hash(key, i * 13 + j);
    if (q(0) > 0.8) continue;
    const s = p.start + (i + 0.5 + 0.5 * (q(1) - 0.5)) * TRY;
    world.spine.at(s, st);
    const roadY = st.y;
    let best: Glacier | null = null;
    let bestRise = 0;
    for (const side of [-1, 1]) {
      // fan out a little: straight out from the road, and a little ahead and behind
      for (const turn of [0, 0.35, -0.35]) {
        const a = st.phi + side * (Math.PI / 2) + turn * side;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const hs: number[] = [];
        for (let d = 160; d <= 3200; d += STEP) {
          world.shape(st.x + dx * d, st.z + dz * d, tp);
          hs.push(tp.wl > tp.bed ? -1e9 : tp.bed);
        }
        // the snout where the land first rises from the valley, the source where the rise ends (or the walk does)
        let k0 = -1;
        for (let k = 0; k + 2 < hs.length; k++) if (hs[k] > -1e8 && (hs[k + 2] - hs[k]) / (2 * STEP) > 0.12) { k0 = k; break; }
        if (k0 < 0 || hs[k0] - roadY > 220) continue;
        let k1 = k0;
        for (let k = k0 + 1; k < hs.length; k++) {
          if (hs[k] < -1e8 || hs[k] < hs[k1] - 30) break;
          if (hs[k] > hs[k1]) k1 = k;
        }
        const rise = hs[k1] - hs[k0];
        const len = (k1 - k0) * STEP;
        if (rise < 260 || len < 700 || rise <= bestRise) continue;
        // the ice's way down: from its source downhill as the land falls, keeping a little of its way each step (so it
        // follows its valley round, not a straight line up the slope), to the height of its snout
        const path: number[] = [];
        let x = st.x + dx * (160 + k1 * STEP);
        let z = st.z + dz * (160 + k1 * STEP);
        let vx = -dx;
        let vz = -dz;
        const snoutY = hs[k0];
        for (let step = 0; step < 180; step++) {
          world.shape(x, z, tp);
          const y = tp.bed;
          path.push(x, y, z);
          if (y <= snoutY + 4 || (tp.wl > tp.bed)) break;
          world.shape(x + 24, z, tp);
          const gx = (tp.bed - y) / 24;
          world.shape(x, z + 24, tp);
          const gz = (tp.bed - y) / 24;
          const gl = Math.hypot(gx, gz);
          if (gl > 1e-4) {
            vx = vx * 0.72 - (gx / gl) * 0.28;
            vz = vz * 0.72 - (gz / gl) * 0.28;
          }
          const vl = Math.hypot(vx, vz) || 1;
          vx /= vl;
          vz /= vl;
          x += vx * STEP;
          z += vz * STEP;
        }
        if (path.length / 3 < 28) continue;
        bestRise = rise;
        best = { s, path, w0: 420 + 380 * q(2), w1: 150 + 140 * q(3), seed: q(4) };
      }
    }
    // (two glaciers never side by side: one a try)
    if (best && !out.some((g) => Math.hypot(g.path[g.path.length - 3] - best!.path[best!.path.length - 3], g.path[g.path.length - 1] - best!.path[best!.path.length - 1]) < 600)) out.push(best);
  }
  return out;
}

const cache = new WeakMap<World, Map<number, Glacier[]>>();

function isGlacier(p: EarthPiece): boolean {
  return p.kind === 'scene' && p.scene?.place.look.landform.id === 'glacier';
}

/** a place's glaciers (none where it has none), the same whoever asks */
export function glaciersOf(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): readonly Glacier[] {
  if (!isGlacier(p)) return [];
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  let v = m.get(p.index);
  if (!v) m.set(p.index, (v = plan(world, p, tp, st)));
  return v;
}

export function hasGlaciers(p: EarthPiece): boolean {
  return isGlacier(p);
}
