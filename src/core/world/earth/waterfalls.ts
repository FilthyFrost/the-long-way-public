/**
 * The waterfalls of a place (V5, docs/V3/nodes/V5-landforms.md): a waterfall gorge had none to be seen from its road —
 * "瀑布直接淋到路面上" its moment and not a drop of falling water — nor a fjord's walls, a table mountain's sides, a
 * glacial valley's, an escarpment's. Now each such place has its falls where its land stands steep beside the road:
 * along its stretch every SPACING m or so, now one side, now the other, the steepest rise of the land within reach of
 * the road found by walking out from it; its lip the top of that rise, its foot the bottom, the water's path the face
 * between them; how wide by the place's wetness and the fall's height. By the world's seed and the place's index, the
 * same whoever asks (game/scene/waterfalls.ts draws them: the falling water, its pool, its spray).
 */
import type { SpineSample } from '../spine';
import type { TerrainPoint, World } from '../terrain';
import type { EarthPiece } from './road';

export interface Fall {
  /** the arc length of the road beside it (m) */
  s: number;
  /** the water's path from its lip down to its foot: x, y, z of each point (m), the lip first */
  path: number[];
  /** which way the face looks (unit, on the plan: from the face out toward the road) */
  ox: number;
  oz: number;
  /** its width at the lip (m), and its height (m) */
  w: number;
  h: number;
  /** the water standing at its foot (a river, a lake: its level), or −Infinity: a pool of its own */
  pool: number;
  seed: number;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x3c6ef372, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** how many of a place's slots hold a fall, by its landform (0: none), and how far out from the road it may stand (m) */
function shareOf(p: EarthPiece): { share: number; reach: number } {
  if (p.kind !== 'scene' || !p.scene) return { share: 0, reach: 0 };
  const sc = p.scene.place;
  const lf = sc.look.landform.id;
  const wet = sc.macro.wet;
  // (no fall in a dry country, and none frozen solid: a glacier's valley in its cold keeps its water as ice)
  if (wet < 0.3) return { share: 0, reach: 0 };
  const by: Record<string, number> = { waterfall_gorge: 0.75, fjord: 0.5, tepui: 0.55, u_valley: 0.35, escarpment: 0.3, danxia: 0.2, pillar_mountain: 0.15, horn_arete: 0.12, canyon: 0.12, sea_cliffs: 0.12 };
  const share = (by[lf] ?? 0) * Math.min(1, (wet - 0.3) / 0.3);
  return { share, reach: lf === 'fjord' || lf === 'tepui' || lf === 'u_valley' ? 900 : 520 };
}

const SPACING = 210;
const STEP = 5;

function plan(world: World, p: EarthPiece, share: number, reach: number, tp: TerrainPoint, st: SpineSample): Fall[] {
  const out: Fall[] = [];
  const key = (world.seed | 0) ^ Math.imul(p.index + 11, 0x27d4eb2f);
  const n = Math.floor((p.end - p.start) / SPACING);
  const wet = p.scene?.place.macro.wet ?? 0.5;
  for (let i = 1; i < n; i++) {
    const q = (j: number): number => hash(key, i * 17 + j);
    if (q(0) > share) continue;
    const s = p.start + (i + 0.6 * (q(1) - 0.5)) * SPACING;
    // (V10) where the road looks from 200 m before: of the ways out from it, the fall it looks at is the one kept
    world.spine.at(Math.max(p.start, s - 200), st);
    const bx = st.x;
    const bz = st.z;
    const bcx = Math.cos(st.phi);
    const bcz = Math.sin(st.phi);
    world.spine.at(s, st);
    const first = q(2) < 0.5 ? -1 : 1;
    let best: Fall | null = null;
    let bestScore = -1e9;
    for (const [side, turn] of [[first, 0], [-first, 0], [first, 0.45], [-first, 0.45]] as const) {
      // (turned forward by `turn`: out and a little ahead)
      const a = st.phi + side * (Math.PI / 2) - side * turn;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      // walk out from the road: the land's height every STEP m, and the steepest long rise in it
      const hs: number[] = [];
      for (let d = 14; d <= reach; d += STEP) {
        world.shape(st.x + nx * d, st.z + nz * d, tp);
        hs.push(tp.bed);
      }
      let runStart = -1;
      let bestRise = 0;
      let b0 = -1;
      let b1 = -1;
      for (let k = 0; k + 1 < hs.length; k++) {
        const steep = (hs[k + 1] - hs[k]) / STEP > 0.85;
        if (steep && runStart < 0) runStart = k;
        if ((!steep || k + 2 === hs.length) && runStart >= 0) {
          const end = steep ? k + 1 : k;
          const rise = hs[end] - hs[runStart];
          if (rise > bestRise) {
            bestRise = rise;
            b0 = runStart;
            b1 = end;
          }
          runStart = -1;
        }
      }
      // (… nor one whose whole rise is in a step or two of the walk — a sheer wall, a pit's or a crater's: a fall has a course)
      if (bestRise < 28 || b0 < 0 || b1 - b0 < 3) continue;
      // (the lip a little back from the top of the rise, where the stream comes over it; no fall on a road above)
      const path: number[] = [];
      for (let k = b1; k >= b0; k--) {
        const d = 14 + k * STEP;
        path.push(st.x + nx * d, hs[k], st.z + nz * d);
      }
      // (at the foot: water standing there — the river beside the road, a lake — or a pool of the fall's own)
      const fd = 14 + b0 * STEP;
      world.shape(st.x + nx * fd, st.z + nz * fd, tp);
      if (tp.d * tp.d < 81) continue;
      const pool = tp.wl > tp.bed - 0.3 ? tp.wl : -Infinity;
      const mx = (path[0] + path[path.length - 3]) / 2 - bx;
      const mz = (path[2] + path[path.length - 1]) / 2 - bz;
      const ahead = (mx * bcx + mz * bcz) / (Math.hypot(mx, mz) || 1);
      const score = Math.min(bestRise, 200) * (1 + 1.5 * ahead);
      if (score <= bestScore) continue;
      bestScore = score;
      best = { s, path, ox: -nx, oz: -nz, w: (3 + 11 * q(3) ** 1.5) * (0.6 + 0.7 * wet) * Math.min(1.3, 0.6 + bestRise / 160), h: bestRise, pool, seed: q(4) };
    }
    if (best) out.push(best);
  }
  return out;
}

const cache = new WeakMap<World, Map<number, Fall[]>>();

/** a place's waterfalls (none where it has none), planned the first time asked, the same after */
export function fallsOf(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): readonly Fall[] {
  const { share, reach } = shareOf(p);
  if (share <= 0) return [];
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  let v = m.get(p.index);
  if (!v) m.set(p.index, (v = plan(world, p, share, reach, tp, st)));
  return v;
}

/** does a place have waterfalls */
export function hasFalls(p: EarthPiece): boolean {
  return shareOf(p).share > 0;
}
