/**
 * The spires of a place (V5, docs/V3/nodes/V5-landforms.md): the rock that stands up out of the land or the sea too
 * steeply for the land to hold it. The land is a height field whose slopes stop at two in one (core/world/features.ts
 * MAX_SLOPE), so a pillar mountain's pillars were sugarloaves of 25 to 55 m under 20 m of wood, and a coast of sea
 * stacks had none: "石柱峰林" and "海蚀柱与拱" under a place's name and not a pillar to be seen. Now each such place
 * has its own, standing on the land or in the sea, drawn as meshes of their own (game/scene/spires.ts):
 *
 *   pillar   a pillar mountain's: sandstone or limestone pillars 90 to 230 m high and 14 to 36 m across the waist, in
 *            clusters of one to four, 150 to 900 m off the road on either side — the forest of pillars standing out
 *            of the wood, trees on their tops and their ledges;
 *   tower    a tower karst's and a cone karst's: broader towers 70 to 170 m high among the land's own cones, rounded,
 *            their tops and ledges wooded, rock only on their sheer sides;
 *   stack    a coast of sea stacks' (and now and then a cliff coast's): stacks 25 to 75 m high in the sea off its
 *            waterline, alone or with a smaller one or two beside, the sea white about their feet.
 *
 * Where: along the place's stretch of road every SPACING m or so, by the world's seed and the place's index, the same
 * whoever asks; never in the road's corridor, never on a place by the road; a pillar's foot the lowest of the land
 * round it (it is sunk where the land falls away), a stack's the sea floor.
 */
import type { SpineSample } from '../spine';
import { Solid, type SolidSource } from '../solids';
import type { TerrainPoint, World } from '../terrain';
import type { EarthPiece } from './road';

export type SpireKind = 'pillar' | 'tower' | 'stack';

export interface Spire {
  kind: SpireKind;
  x: number;
  z: number;
  /** the arc length of the road beside it (m) */
  s: number;
  /** where its foot is: the lowest of the land (or the sea floor) round it (m) */
  foot: number;
  /** the level its rock rises from: the sea's (a stack) or the land's at its middle (m) */
  level: number;
  /** its half width at the waist, and how far it stands above `level` (m) */
  r: number;
  h: number;
  /** which way it is turned (rad), and how much deeper than wide its section is (0.6 … 1) */
  yaw: number;
  depth: number;
  /** how wooded its top and ledges are, 0 bare … 1 */
  green: number;
  seed: number;
}

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

interface Recipe {
  kind: SpireKind;
  /** the share of the stretch's slots that hold a cluster */
  share: number;
  /** how far from the road's centre line (m): near, far */
  off: readonly [number, number];
  /** waist half width and height (m) */
  r: readonly [number, number];
  h: readonly [number, number];
  /** at most this many beside the first */
  group: number;
  green: number;
}

/** what spires a place has, by its landform (null: none) */
function recipeOf(p: EarthPiece): Recipe | null {
  if (p.kind !== 'scene' || !p.scene) return null;
  const lf = p.scene.place.look.landform.id;
  const wet = p.scene.place.macro.wet;
  const green = Math.min(1, Math.max(0, (wet - 0.25) / 0.45));
  switch (lf) {
    case 'pillar_mountain':
      return { kind: 'pillar', share: 0.78, off: [70, 700], r: [14, 36], h: [90, 230], group: 3, green: Math.max(0.6, green) };
    case 'tower_karst':
      return { kind: 'tower', share: 0.5, off: [110, 850], r: [34, 70], h: [70, 170], group: 2, green: Math.max(0.65, green) };
    case 'cone_karst':
      return { kind: 'tower', share: 0.3, off: [160, 950], r: [40, 75], h: [70, 150], group: 1, green: Math.max(0.65, green) };
    case 'sea_stacks':
      return { kind: 'stack', share: 0.8, off: [25, 260], r: [8, 24], h: [25, 75], group: 2, green: green * 0.6 };
    case 'sea_cliffs':
      return { kind: 'stack', share: 0.18, off: [25, 200], r: [7, 18], h: [20, 55], group: 1, green: green * 0.5 };
    default:
      return null;
  }
}

const SPACING = 140;

/** the lowest of the land round (x, z) within reach r, and the land at its middle */
function footOf(world: World, tp: TerrainPoint, x: number, z: number, r: number): { foot: number; mid: number; dry: boolean; clear: number } {
  world.shape(x, z, tp);
  const mid = tp.bed;
  let foot = tp.bed;
  let dry = !(tp.wl > tp.bed - 0.5);
  let clear = Math.abs(tp.d);
  if (tp.site > 0.01) dry = false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    world.shape(x + Math.cos(a) * r, z + Math.sin(a) * r, tp);
    foot = Math.min(foot, tp.bed);
    if (tp.wl > tp.bed - 0.5 || tp.site > 0.01) dry = false;
    clear = Math.min(clear, Math.abs(tp.d));
  }
  return { foot, mid, dry, clear };
}

function plan(world: World, p: EarthPiece, rc: Recipe, tp: TerrainPoint, st: SpineSample): Spire[] {
  const out: Spire[] = [];
  const key = (world.seed | 0) ^ Math.imul(p.index + 7, 0x2545f491);
  const n = Math.floor((p.end - p.start) / SPACING);
  const lerp = (a: readonly [number, number], t: number): number => a[0] + (a[1] - a[0]) * t;
  for (let i = 1; i < n; i++) {
    const q = (j: number): number => hash(key, i * 31 + j);
    if (q(0) > rc.share) continue;
    const s = p.start + (i + 0.7 * (q(1) - 0.5)) * SPACING;
    world.spine.at(s, st);
    let side: number;
    let shore = 0;
    if (rc.kind === 'stack') {
      const c = world.sea.seaAt(s);
      if (!c) continue;
      side = c.side;
      // the waterline on the sea's side
      shore = -1;
      const nx = -Math.sin(st.phi) * side;
      const nz = Math.cos(st.phi) * side;
      for (let d = 14; d < 1400; d += 10) {
        world.shape(st.x + nx * d, st.z + nz * d, tp);
        if (tp.wkind === 3 && tp.wl > tp.bed + 0.5) {
          shore = d;
          break;
        }
      }
      if (shore < 0) continue;
    } else side = q(2) < 0.5 ? -1 : 1;
    // (the nearer ones the likelier: a pillar far off is a pillar fewer see)
    let off = shore + lerp(rc.off, q(3) ** 1.6);
    if (rc.kind !== 'stack') {
      // (V8) of three places for it, the one the road looks at from a few hundred metres before: met dead ahead as the
      // road comes round to it, not off to one side behind the trees
      const here = { x: st.x, z: st.z, phi: st.phi };
      world.spine.at(Math.max(p.start, s - 260), st);
      const bx = st.x;
      const bz = st.z;
      const bcx = Math.cos(st.phi);
      const bcz = Math.sin(st.phi);
      let best = -2;
      for (let c = 0; c < 3; c++) {
        const sd = c === 0 ? side : q(40 + c * 3) < 0.5 ? -1 : 1;
        const of = c === 0 ? off : lerp(rc.off, q(41 + c * 3) ** 1.6);
        const cx = here.x - Math.sin(here.phi) * sd * of;
        const cz = here.z + Math.cos(here.phi) * sd * of;
        const L = Math.hypot(cx - bx, cz - bz) || 1;
        const score = ((cx - bx) * bcx + (cz - bz) * bcz) / L;
        if (score > best) {
          best = score;
          side = sd;
          off = of;
        }
      }
      world.spine.at(s, st);
    }
    const nx = -Math.sin(st.phi) * side;
    const nz = Math.cos(st.phi) * side;
    const tx = Math.cos(st.phi);
    const tz = Math.sin(st.phi);
    const group = q(4) < 0.55 ? Math.floor(q(5) * (rc.group + 0.999)) : 0;
    let lead: Spire | null = null;
    for (let g = 0; g <= group; g++) {
      // (none beside a first that found no room)
      if (g > 0 && !lead) break;
      const qq = (j: number): number => q(10 + g * 12 + j);
      const big = g === 0 ? 1 : 0.4 + 0.45 * qq(0);
      const r = lerp(rc.r, qq(1)) * (0.65 + 0.35 * big);
      const h = lerp(rc.h, qq(2) ** 1.4) * (0.55 + 0.45 * big);
      // (one beside the first stands off it along the road and across, never into it)
      const along = g === 0 ? 0 : (qq(3) - 0.5) * 2 * (lead!.r + r + 18 + 70 * qq(4));
      const across = g === 0 ? 0 : (qq(5) - 0.35) * (lead!.r + r + 40);
      const x = st.x + nx * (off + across) + tx * along;
      const z = st.z + nz * (off + across) + tz * along;
      let foot: number;
      let level: number;
      if (rc.kind === 'stack') {
        world.shape(x, z, tp);
        if (tp.wkind !== 3 || tp.wl < tp.bed + 2) continue;
        foot = tp.bed;
        level = tp.wl;
      } else {
        const f = footOf(world, tp, x, z, r * 1.15);
        if (!f.dry || f.clear < r * 1.2 + 32) continue;
        foot = f.foot;
        level = f.mid;
      }
      // (no two overlap)
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r + 6)) continue;
      const sp: Spire = {
        kind: rc.kind,
        x,
        z,
        s,
        foot,
        level,
        r,
        h,
        yaw: qq(6) * Math.PI * 2,
        depth: 0.62 + 0.38 * qq(7),
        green: rc.green * (0.75 + 0.25 * qq(8)),
        seed: qq(9),
      };
      out.push(sp);
      if (g === 0) lead = sp;
    }
  }
  return out;
}

const cache = new WeakMap<World, Map<number, Spire[]>>();

/** a place's spires (none where it has none), planned the first time asked, the same after */
export function spiresOf(world: World, p: EarthPiece, tp: TerrainPoint, st: SpineSample): readonly Spire[] {
  const rc = recipeOf(p);
  if (!rc) return [];
  let m = cache.get(world);
  if (!m) cache.set(world, (m = new Map()));
  let v = m.get(p.index);
  if (!v) m.set(p.index, (v = plan(world, p, rc, tp, st)));
  return v;
}

/** does a place have spires */
export function hasSpires(p: EarthPiece): boolean {
  return recipeOf(p) !== null;
}

/**
 * The spires as solids: a round post the width of each one's waist from its foot to its top, so that whoever leaves the
 * road on foot or in a car keeps out of the rock (ModGame adds it to the sources the walker and the vehicles ask).
 */
export class SpireSolids implements SolidSource {
  private readonly tp: TerrainPoint;
  private readonly st: SpineSample;

  constructor(
    private readonly world: World,
    tp: TerrainPoint,
    st: SpineSample,
  ) {
    this.tp = tp;
    this.st = st;
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const earth = this.world.earth;
    if (!earth) return;
    const s = this.world.spine.sAtX(x);
    for (const p of earth.pieces) {
      if (p.end < s - 1500 || p.start > s + 1500 || !hasSpires(p)) continue;
      for (const sp of spiresOf(this.world, p, this.tp, this.st)) {
        const reach = sp.r * 1.05;
        const dx = sp.x - x;
        const dz = sp.z - z;
        if (dx * dx + dz * dz > (r + reach) * (r + reach)) continue;
        out.push(new Solid().set(sp.x, sp.z, reach, 0, 0, sp.foot - 2, sp.level + sp.h, false, `spire:${sp.kind}`));
      }
    }
  }
}
