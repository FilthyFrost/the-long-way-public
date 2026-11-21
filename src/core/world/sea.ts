/**
 * The sea (docs/DESIGN_V2.md 4.1, 4.5: 湖区与海岸): a chapter of lake country may have the sea along
 * one whole side of it. For most of the chapter the coast lies two or three kilometres off — over
 * the hills, seen from the high places — and along one or two stretches it comes in to the road:
 * the land on that side falls to a beach, and the water runs to the horizon.
 *
 * One sea has one level, hung from the road where it runs along the shore (a few metres below the
 * lowest point the road reaches there), so the coast road always looks down on the water and never
 * gets its feet wet. At both ends of the chapter the far coast swings away to the horizon: from the
 * road the sea is a great bay with headlands far off up and down the coast, and nothing across it.
 *
 * Like the lakes, the sea is part of the height function: `carve` turns the land a point would
 * have had into coast, beach or sea bed. Pure and seeded.
 *
 * Like them it also says how far any point is from its waterline (`shore`), for the ecotope field.
 */
import { fbm1 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES, regionRow, type RegionDef } from './biomes';
import { LAND_SLOT } from './landform';
import { type RoadSpine, SpineSample } from './spine';

/** over this length the shore comes in from the far coast to the road at either end of a run (m) */
export const COAST_FADE = 700;
/** over this length the far coast leaves for the horizon at either end of a sea (m) */
export const SEA_END = 2400;
/** how far from the road the sea begins where the road is not on the coast (m, give or take a third) */
export const FAR_COAST = 2300;
/** depth of the open sea (m) */
export const SEA_DEPTH = 14;
/** how far inland of the beach the land is brought down to it, where the coast is far from the road (m) */
const SHORE_RISE = 320;
/** the nearest a far coast ever comes to the road (m): FAR_COAST less the most its noise can take off */
const FAR_MIN = FAR_COAST * (1 - 0.32 - 0.07);
/** a sea's waterline is traced every this many metres of x (`lineOf`), and kept in runs of this many stretches, each with the span of z it lies in */
const LINE_STEP = 4;
const LINE_RUN = 8;
/** a waterline farther from the road than this is traced as being this far (m): the far coast leaving for the horizon at the ends of a sea */
const LINE_FAR = 1e5;

/** a sea's waterline, traced (`SeaPlan.lineOf`): z at x0, x0 + LINE_STEP, …, and for every run of LINE_RUN stretches the least and the greatest z in it */
interface ShoreLine {
  readonly x0: number;
  /** how many stretches there are (one fewer than there are points) */
  readonly n: number;
  readonly z: Float64Array;
  readonly lo: Float64Array;
  readonly hi: Float64Array;
}

/** a stretch where the shore comes in to the road: whole slots */
export interface CoastRun {
  k0: number;
  k1: number;
  s0: number;
  s1: number;
  /** (world version 5) the height of the cliff the road runs along here (m; 0: a low shore) */
  cliff?: number;
}

/** (world version 5) over this length the far coast leaves for the horizon at either end of a sea: a sea there is a run of places by it, a few kilometres each */
const SEA_END_V5 = 900;
/** (world version 5) how far into a place the shore comes in to the road, past the blend with the place before (m) */
const RUN_IN_V5 = 700;

/** one sea: the chapter it lies along, and the stretches where the road runs on its shore */
export interface Coast {
  chapter: number;
  /** arc lengths between which there is sea on that side of the road */
  s0: number;
  s1: number;
  /** which side of the road the sea is on: +1 right, −1 left */
  side: number;
  level: number;
  seed: number;
  runs: CoastRun[];
  /** (world version 5) a cliff coast's height: the road along its shore that far above the water, the shore at the cliff's foot (0: none) */
  cliff: number;
  /** over how long the far coast leaves for the horizon at its ends (m) */
  fade?: number;
}

/** what the sea does to one point of the land */
export class SeaEffect {
  /** sea level there; −Infinity where there is no sea about */
  level = -Infinity;
  /** metres out from the waterline (negative: inland of it) */
  off = 0;
}

const st = new SpineSample();

/** the regions whose chapters may have the sea along them, by id: of the first six, the lake country alone */
const BY_THE_SEA: Record<string, boolean> = {
  plains: false,
  desert: false,
  alpine: false,
  lakes: true,
};

/** may a chapter of this region have the sea along it? What the region says itself (`sea`), else the row under its id, else its kin's. */
export function seaAlong(region: RegionDef): boolean {
  return region.sea ?? regionRow(BY_THE_SEA, region);
}

export class SeaPlan {
  private readonly seas = new Map<number, Coast | null>();
  /** the traced waterlines of the seas asked about so far, by chapter (`lineOf`) */
  private readonly lines = new Map<number, ShoreLine>();
  private readonly seed: number;

  constructor(
    private readonly spine: RoadSpine,
    seed: number,
  ) {
    this.seed = hash2(seed | 0, 0x5ea, 53);
  }

  /** the sea of chapter c (null: that chapter has none) — decided from the dice, the biome and the road alone */
  seaOf(chapter: number): Coast | null {
    let c = this.seas.get(chapter);
    if (c !== undefined) return c;
    c = null;
    const plan = this.spine.plan;
    // (world version 5: one sea along a run of places by it, the shore at the road through the heart of each)
    if (plan.rules.version >= 5) {
      c = this.seaOfRun(chapter);
      this.seas.set(chapter, c);
      return c;
    }
    const h = hash2(chapter, 0x5ea5, this.seed);
    const region = BIOMES[plan.biomeOf(chapter)];
    const cliff = region.cliff ?? 0;
    if (chapter >= 0 && seaAlong(region) && (h & 0xff) / 255 < 0.85) {
      // well inside the chapter: lake country on both sides of every point of it
      const left = plan.rules.version === 1 ? plan.transition : plan.transitionAt(chapter);
      const right = plan.rules.version === 1 ? plan.transition : plan.transitionAt(chapter + 1);
      const a = plan.starts[chapter] + (left / 2 + 350);
      const b = plan.starts[chapter + 1] - (right / 2 + 350);
      // (and not at the very start of the journey: the first stretches are the same for everybody)
      const kA = Math.max(3, Math.ceil((a + 250) / LAND_SLOT));
      const kB = Math.floor((b - 250) / LAND_SLOT) - 1;
      if (kB - kA + 1 >= 2) {
        const side = h & 0x10000 ? 1 : -1;
        const seed = hash2(chapter, 0x5ea6, this.seed);
        // the road's lowest and highest point in every stretch
        const lo: number[] = [];
        const hi: number[] = [];
        for (let k = kA; k <= kB; k++) {
          let l = Infinity;
          let u = -Infinity;
          for (let s = k * LAND_SLOT; s <= (k + 1) * LAND_SLOT; s += 25) {
            this.spine.at(s, st);
            if (st.y < l) l = st.y;
            if (st.y > u) u = st.y;
          }
          lo.push(l);
          hi.push(u);
        }
        // the first run: two to four stretches by the dice, laid where the road rises and falls least
        // (a coast road keeps near the water), the lower of two equals
        const pick = (len: number, from: number, to: number, level: number): number => {
          let best = -1;
          let bestScore = Infinity;
          for (let k = from; k + len - 1 <= to; k++) {
            let l = Infinity;
            let u = -Infinity;
            for (let q = k; q < k + len; q++) {
              l = Math.min(l, lo[q - kA]);
              u = Math.max(u, hi[q - kA]);
            }
            // (a later run must lie at the sea's own level: not below it, not high above it)
            if (level > -Infinity && (l < level + 5 + cliff || l > level + 16 + cliff)) continue;
            const score = u - l + 0.004 * ((hash2(k, len, seed) & 0xffff) / 65536);
            if (score < bestScore) {
              bestScore = score;
              best = k;
            }
          }
          return best;
        };
        const len0 = Math.min(kB - kA + 1, 2 + ((h >>> 8) % 3));
        const k0 = pick(len0, kA, kB, -Infinity);
        const runs: CoastRun[] = [];
        let level = -Infinity;
        if (k0 >= 0) {
          let low = Infinity;
          for (let q = k0; q < k0 + len0; q++) low = Math.min(low, lo[q - kA]);
          level = low - 5.5 - 4 * (((h >>> 20) & 0xff) / 255) - cliff;
          runs.push(this.run(k0, k0 + len0 - 1));
          // a second run two stretches or more away, if the road comes down to the water again
          if (((h >>> 12) & 0xf) < 10) {
            const len1 = 2 + ((h >>> 28) % 2);
            const before = pick(len1, kA, k0 - 3, level);
            const after = pick(len1, k0 + len0 + 2, kB, level);
            const k1 = after >= 0 && (before < 0 || h & 0x20000) ? after : before;
            if (k1 >= 0) runs.push(this.run(k1, k1 + len1 - 1));
            runs.sort((p, q) => p.k0 - q.k0);
          }
        }
        if (runs.length > 0) c = { chapter, s0: a, s1: b, side, level, seed, runs, cliff };
      }
    }
    this.seas.set(chapter, c);
    return c;
  }

  private run(k0: number, k1: number): CoastRun {
    return { k0, k1, s0: k0 * LAND_SLOT + 40, s1: (k1 + 1) * LAND_SLOT - 40 };
  }

  /**
   * (world version 5) The sea of a run of places by it: from a little into the first to a little before the end of
   * the last, on one side of the road; the shore at the road through each place's heart, past its blends — at the
   * foot of its cliff where it is a cliff road (RegionDef.cliff), a few metres below the road where it runs along
   * the shore; one level for the sea, hung from the lowest of its runs.
   */
  private seaOfRun(chapter: number): Coast | null {
    const plan = this.spine.plan;
    if (chapter < 1 || !seaAlong(BIOMES[plan.biomeOf(chapter)])) return null;
    let c0 = chapter;
    while (c0 > 1 && seaAlong(BIOMES[plan.biomeOf(c0 - 1)])) c0--;
    // (the run's sea is its first place's, made once for all of them)
    if (c0 !== chapter) return this.seaOf(c0);
    let c1 = chapter;
    while (c1 < chapter + 16 && seaAlong(BIOMES[plan.biomeOf(c1 + 1)])) c1++;
    plan.biomeOf(c1 + 2);
    const h = hash2(c0, 0x5ea7, this.seed);
    const side = h & 0x10000 ? 1 : -1;
    const seed = hash2(c0, 0x5ea8, this.seed);
    const runs: CoastRun[] = [];
    let level = Infinity;
    let cliffMost = 0;
    for (let ch = c0; ch <= c1; ch++) {
      const a = plan.starts[ch] + RUN_IN_V5;
      const b = plan.starts[ch + 1] - RUN_IN_V5;
      const k0 = Math.max(3, Math.ceil(a / LAND_SLOT));
      const k1 = Math.floor(b / LAND_SLOT) - 1;
      if (k1 < k0) continue;
      const cliff = BIOMES[plan.biomes[ch]].cliff ?? 0;
      let low = Infinity;
      for (let s = k0 * LAND_SLOT; s <= (k1 + 1) * LAND_SLOT; s += 25) {
        this.spine.at(s, st);
        if (st.y < low) low = st.y;
      }
      level = Math.min(level, low - (cliff > 0 ? cliff : 5.5 + 4 * (((hash2(ch, 0x5ea9, this.seed) >>> 8) & 0xff) / 255)));
      cliffMost = Math.max(cliffMost, cliff);
      runs.push({ ...this.run(k0, k1), cliff });
    }
    if (!runs.length) return null;
    return { chapter: c0, s0: plan.starts[c0] + 250, s1: plan.starts[c1 + 1] - 250, side, level, seed, runs, cliff: cliffMost, fade: SEA_END_V5 };
  }

  /** the cliff the road runs along at arc length s (m; 0: a low shore, or no run there) */
  static cliffAt(c: Coast, s: number): number {
    if (!c.cliff) return 0;
    let best = 0;
    let near = Infinity;
    for (const r of c.runs) {
      const d = s < r.s0 ? r.s0 - s : s > r.s1 ? s - r.s1 : 0;
      if (d < near) {
        near = d;
        best = r.cliff ?? 0;
      }
    }
    return best;
  }

  /** the sea along the road at arc length s (null: none there) */
  seaAt(s: number): Coast | null {
    if (s < 0) return null;
    const c = this.seaOf(this.spine.plan.chapterAt(s));
    return c && s > c.s0 && s < c.s1 ? c : null;
  }

  /** the sea whose shore slot k of the road runs along (null: it is not on the coast) */
  coastOf(k: number): Coast | null {
    if (k < 0) return null;
    const c = this.seaAt((k + 0.5) * LAND_SLOT);
    if (!c) return null;
    for (const r of c.runs) if (k >= r.k0 && k <= r.k1) return c;
    return null;
  }

  /** is slot k on the coast, or next to a stretch that is? (no lake is put there) */
  near(k: number): boolean {
    return this.coastOf(k) !== null || this.coastOf(k - 1) !== null || this.coastOf(k + 1) !== null;
  }

  /** does slot k lie along a sea, near or far? (no river is put there: it would have to end in it) */
  along(k: number): boolean {
    return this.seaAt(k * LAND_SLOT) !== null || this.seaAt((k + 1) * LAND_SLOT) !== null || this.seaAt((k + 0.5) * LAND_SLOT) !== null;
  }

  /** how fully there is sea on that side at arc length s: 0 at the ends of the chapter … 1 */
  static seaWeight(c: Coast, s: number): number {
    const f = c.fade ?? SEA_END;
    return smoothstep(c.s0, c.s0 + f, s) * (1 - smoothstep(c.s1 - f, c.s1, s));
  }

  /** how fully the coast is at the road at arc length s: 0 away from the runs … 1 along them */
  static weight(c: Coast, s: number): number {
    let w = 0;
    for (const r of c.runs) {
      if (s <= r.s0 || s >= r.s1) continue;
      const q = smoothstep(r.s0, r.s0 + COAST_FADE, s) * (1 - smoothstep(r.s1 - COAST_FADE, r.s1, s));
      if (q > w) w = q;
    }
    return w;
  }

  /**
   * How far from the road's centre line the waterline lies at arc length s (m): a stone's throw along
   * a run, kilometres off elsewhere, running away to the horizon towards the ends of the sea.
   * Infinity outside it.
   */
  static shoreAt(c: Coast, s: number): number {
    const ws = SeaPlan.seaWeight(c, s);
    if (ws <= 0.002) return Infinity;
    // (a cliff coast's shore lies at the cliff's foot, as far out as the cliff takes to fall: world/landform.ts shelfAt)
    const cliff = SeaPlan.cliffAt(c, s);
    const near = cliff > 0 ? 9 + 1.1 * cliff + 6 + 10 * (0.5 + 0.5 * fbm1(s / 420, c.seed, 2)) : 112 + 68 * fbm1(s / 620, c.seed, 2) + 22 * fbm1(s / 150, c.seed + 7, 1);
    const far = FAR_COAST * (1 + 0.32 * fbm1(s / 2700, c.seed + 3, 2) + 0.07 * fbm1(s / 520, c.seed + 5, 2)) + (1 / ws - 1) * 1900;
    const w = SeaPlan.weight(c, s);
    // (the shore swings in as a bay does: slowly at first, then along the road)
    const t = w * w * (3 - 2 * w);
    return (near < 46 ? 46 : near) * t + far * (1 - t);
  }

  /** width of the beach at arc length s (m) */
  static beachAt(c: Coast, s: number): number {
    // (under a cliff a strip of shingle and boulders, no more)
    if (SeaPlan.cliffAt(c, s) > 0) return 5 + 4 * fbm1(s / 310, c.seed + 13, 2);
    return 24 + 16 * fbm1(s / 310, c.seed + 13, 2);
  }

  /**
   * The land at a point `lat` metres to the right of the road (negative: left), where the road point
   * with the same x has arc length s0 and elevation roadY and the land would have stood at T. On the
   * sea's side it is the coast's own: along a run a slope down from the road, a beach, the sea bed;
   * where the coast is far off, the land as it lies, brought down to the beach over its last few
   * hundred metres. Returns the new land height and fills `out`.
   */
  carve(s0: number, lat: number, T: number, roadY: number, out: SeaEffect): number {
    out.level = -Infinity;
    const c = this.seaAt(s0);
    if (!c) return T;
    const L = lat * c.side;
    if (L < 16) return T;
    const ws = SeaPlan.seaWeight(c, s0);
    if (ws <= 0.002) return T;
    // (most of what is ever asked lies by the road with the coast kilometres off: settled without any noise)
    if (L < FAR_MIN - 160 - Math.max(SHORE_RISE, (T - c.level) * 1.3) && SeaPlan.weight(c, s0) <= 0) return T;
    const D = SeaPlan.shoreAt(c, s0);
    // metres out from the waterline (negative on land), measured square to it: where the shore runs
    // away from the road at a slant — the sides of a bay — a metre across the road's line is less than
    // a metre from the water, and the beach must not be squeezed into a bank
    const turn = (SeaPlan.shoreAt(c, s0 + 6) - D) / 6;
    const e = (L - D) / Math.sqrt(1 + (turn < 40 && turn > -40 ? turn * turn : 1600));
    // (high land comes down to the water over a longer stretch: a steep coast, not a wall — but a cliff is a wall)
    const cliffHere = SeaPlan.cliffAt(c, s0) > 0 && SeaPlan.weight(c, s0) > 0.5;
    const rise = cliffHere ? 10 : Math.max(SHORE_RISE, (T - c.level) * 1.3);
    // well inland of a far coast nothing changes, and nothing needs to know of the sea
    if (e < -rise - 160 && D > 600) return T;
    const B = SeaPlan.beachAt(c, s0);
    out.level = c.level;
    out.off = e;
    let h: number;
    if (e >= 0) {
      // a shelf a child can wade on, then down to the deep
      h = c.level - (e < 25 ? e * 0.06 : Math.min(SEA_DEPTH, 1.5 + (e - 25) * 0.036));
    } else {
      const up = -e;
      const top = c.level + 1.15;
      if (up < B) h = c.level + 1.15 * Math.pow(up / B, 0.8);
      else {
        // the land as it lies, let down to the beach over its last stretch — and near the water never
        // below the top of the beach (further inland a hollow may be a hollow again)
        const v = Math.min(1, (up - B) / rise);
        const floor = top + 0.4 + 0.012 * (up - B);
        const Tn = T > floor ? T : T + (floor - T) * (1 - smoothstep(rise, rise + 110, up - B));
        const lies = top + (Tn - top) * (v * v * (3 - 2 * v));
        // along a run it is the road's own slope instead: easy at the bottom, a bank below the road,
        // low dunes on the way
        // (a cliff coast keeps its cliff: the land as its shelf lies, let down to the shingle at its foot)
        const k = cliffHere ? 0 : 1 - smoothstep(240, 520, D);
        if (k > 0) {
          const run = D - B - 30;
          const u = run > 1 ? Math.min(1, (up - B) / run) : 1;
          const slope = top + (roadY - 0.4 - top) * Math.pow(u, 1.7) + 0.4 * fbm1((s0 + up * 3.1) / 23, c.seed + 29, 2) * smoothstep(B, B + 18, up) * (1 - u);
          h = lies + (slope - lies) * k;
        } else h = lies;
      }
    }
    // close to the road the land stays the road's; and at the ends of the sea, where the coast is
    // leaving for the horizon, the land goes back to what it would have been
    return T + (h - T) * smoothstep(16, 34, L) * smoothstep(0, 0.22, ws);
  }

  /**
   * A sea's waterline, traced once. The land function finds the sea from the road point with the same x as
   * the point it is asked about (`carve`: the shore lies `shoreAt` metres across the road from there), so
   * the waterline is one z for every x: the road's z there, and the shore's distance across the road
   * turned into a distance along z by the road's heading. Here it is at every LINE_STEP m of x from one end
   * of the sea to the other; joined, the points are the waterline to within a hand's width or two.
   */
  private lineOf(c: Coast): ShoreLine {
    let line = this.lines.get(c.chapter);
    if (line) return line;
    const sp = this.spine;
    sp.at(c.s0, st);
    const x0 = Math.ceil(st.x / LINE_STEP) * LINE_STEP;
    sp.at(c.s1, st);
    const n = Math.max(1, Math.floor((st.x - x0) / LINE_STEP));
    const z = new Float64Array(n + 1);
    for (let i = 0; i <= n; i++) {
      const s = sp.sAtX(x0 + i * LINE_STEP);
      sp.at(s, st);
      const D = s > c.s0 && s < c.s1 ? SeaPlan.shoreAt(c, s) : Infinity;
      z[i] = st.z + (c.side * (D < LINE_FAR ? D : LINE_FAR)) / Math.cos(st.phi);
    }
    const runs = Math.ceil(n / LINE_RUN);
    const lo = new Float64Array(runs);
    const hi = new Float64Array(runs);
    for (let r = 0; r < runs; r++) {
      let l = Infinity;
      let h = -Infinity;
      for (let i = r * LINE_RUN; i <= Math.min(n, (r + 1) * LINE_RUN); i++) {
        if (z[i] < l) l = z[i];
        if (z[i] > h) h = z[i];
      }
      lo[r] = l;
      hi[r] = h;
    }
    line = { x0, n, z, lo, hi };
    this.lines.set(c.chapter, line);
    return line;
  }

  /**
   * The sea's own account of its edge: how far (x, z) is from its waterline (m), 0 in the sea; `far` where
   * no sea lies within `far` m. From the plan's geometry alone: it is the distance to the traced waterline
   * (`lineOf`), which is the line where `carve` puts the water's edge. So it has no step anywhere, and it
   * is the distance itself, also where the shore swings in to the road at the ends of a coast run and
   * runs square to it.
   * @param s0 arc length of the road point with the same x
   */
  shore(x: number, z: number, s0: number, far: number): number {
    const c = this.seaAt(s0);
    if (!c) return far;
    // Most of what is ever asked lies by the road with the coast kilometres off: settled without tracing
    // anything. Away from the coast runs the shore is nowhere nearer the road than FAR_MIN; within `far`
    // of the point in x the road's own z changes by no more than `far` and a fifth, at its steepest
    // heading; so a point no farther out from the road than FAR_MIN less twice `far` and a fifth has no
    // shore within `far`. (The road covers no more than a metre of x for a metre of its length, and no
    // less than two thirds: 1.6 times `far` along the road is beyond `far` in x.)
    let runs = false;
    for (const r of c.runs) if (s0 + 1.6 * far > r.s0 && s0 - 1.6 * far < r.s1) runs = true;
    if (!runs) {
      this.spine.at(s0, st);
      if ((z - st.z) * c.side < FAR_MIN - 2.2 * far) return far;
    }
    const line = this.lineOf(c);
    const Z = line.z;
    const u = (x - line.x0) / LINE_STEP;
    if (u < 0 || u >= line.n) return far;
    const i = Math.floor(u);
    // in the sea: beyond the waterline at this x, on the sea's side
    const out = (z - (Z[i] + (Z[i + 1] - Z[i]) * (u - i))) * c.side;
    if (out >= 0) return 0;
    // The nearest of the line's stretches: from the one at this x outwards both ways, as far as a stretch
    // can still be nearer than the nearest found (or than `far`), run by run; a run is asked into only
    // when the box it lies in comes nearer than that.
    let best = out > -far ? out * out : far * far;
    const px = u * LINE_STEP;
    for (let turn = 0; turn < 2; turn++) {
      for (let k = turn === 0 ? i : i - 1; k >= 0 && k < line.n; ) {
        const r = Math.floor(k / LINE_RUN);
        const first = r * LINE_RUN;
        const last = Math.min(line.n, first + LINE_RUN) - 1;
        // (how far along x this run's nearest end is; within the run the point's own x: nothing)
        const gap = turn === 0 ? (k === i ? 0 : first * LINE_STEP - px) : k === i - 1 && first <= i ? 0 : px - (last + 1) * LINE_STEP;
        if (gap * gap >= best) break;
        const dz = z < line.lo[r] ? line.lo[r] - z : z > line.hi[r] ? z - line.hi[r] : 0;
        if (gap * gap + dz * dz < best) {
          for (let q = turn === 0 ? k : first; q <= (turn === 0 ? last : k); q++) {
            const ex = LINE_STEP;
            const ez = Z[q + 1] - Z[q];
            const wx = px - q * LINE_STEP;
            const wz = z - Z[q];
            let t = (wx * ex + wz * ez) / (ex * ex + ez * ez);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const dx = wx - t * ex;
            const dd = wz - t * ez;
            const d2 = dx * dx + dd * dd;
            if (d2 < best) best = d2;
          }
        }
        k = turn === 0 ? last + 1 : first - 1;
      }
    }
    const d = Math.sqrt(best);
    return d < far ? d : far;
  }

  /**
   * How open the land is kept at a point `lat` metres to the right of the road at arc length s0, 0…1:
   * along a run, between the road and the water, nothing tall grows and the grass is short — the
   * whole point of a coast road is the view.
   */
  open(s0: number, lat: number): number {
    const c = this.seaAt(s0);
    if (!c) return 0;
    const L = lat * c.side;
    if (L < 0) return 0;
    const w = SeaPlan.weight(c, s0);
    return w <= 0 ? 0 : smoothstep(0.25, 0.7, w);
  }

  /** seas with any part between two arc lengths */
  between(sMin: number, sMax: number, out: Coast[]): Coast[] {
    out.length = 0;
    const plan = this.spine.plan;
    const c1 = plan.chapterAt(Math.max(0, sMax));
    for (let ch = plan.chapterAt(Math.max(0, sMin)); ch <= c1; ch++) {
      const c = this.seaOf(ch);
      if (c && c.s1 >= sMin && c.s0 <= sMax) out.push(c);
    }
    return out;
  }
}
