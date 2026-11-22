/**
 * The great forms of a place (docs/V3/nodes/G-ghibli.md, G8): the landforms that are a shape of the whole country and
 * not a hill beside the road —
 *
 *   pan       a salt flat: the basin's floor levelled to one plane for kilometres either side of the road, standing in
 *             a hand of water after the rains — the sky's mirror ("一望无际的白，雨后成了天空之镜"); the road a low
 *             causeway straight across it;
 *   caldera   a crater lake: a ring of rock three kilometres across round a deep lake, its rim standing over the road,
 *             the road cut through the rim and run for a couple of kilometres along the inner wall, the lake far below
 *             on the one hand and the crest on the other ("翻上火口缘，下面一池深蓝"); a cone's island in the lake;
 *   pit       a karst's great pits (天坑): holes a few hundred metres across and a hundred or two deep, their walls as
 *             steep as the land can hold, forest on their floors, the first of them at the road's very edge. The land
 *             as it lies, let down: a pit on a slope has a floor that slopes with it.
 *
 * The land function's cross-sections (landform.ts) hang the land from the road, and its anchored forms (features.ts)
 * only add height beside it: neither can sink a lake two hundred metres under the road or level a plain to a plane.
 * These are laid out in the world's own plane, once for a place — the first time the land there is asked for, from
 * the road alone (the land is never asked in its turn) — and shape the land to an absolute form: the pan's level,
 * the lake's, the rim's. What they keep (terrain.ts shape):
 *   - the road and its shoulders are as they were: within `edge` m of the centre line nothing changes, and beyond it
 *     the land departs from what it was no faster than a cutting's or an embankment's side (`batter` in one);
 *   - height is continuous, and a form fades to nothing at its outer edge;
 *   - a place's forms lie wholly abreast of its own road (between the x of its two ends): a point asks only the place
 *     the road is in at its own x;
 *   - arithmetic and hashes only.
 * Their water is the land function's own (TerrainPoint.wl): a lake's (kind 1), or the pan's film (kind 4).
 *
 * Pure, no three, no DOM.
 */
import { fbm2 } from '../../math/noise';
import { hash2 } from '../../math/rng';
import { featureProfile } from '../features';
import { SpineSample, type RoadSpine } from '../spine';
import type { EarthPiece, EarthRoad } from './road';

/** the water standing on a pan (m): a hand's depth */
export const PAN_FILM = 0.05;
/** the water kind of a pan's film (TerrainPoint.wkind: 1 lake, 2 river, 3 the sea) */
export const WATER_FILM = 4;
/** how far the road's surface stands above its pan at the pan's lowest (m), and how much higher the road may climb and still be on it */
const PAN_FREEBOARD = 0.8;
const PAN_RISE = 3.2;
/** a pan's causeway: its bank begins this far from the centre line and falls one in three */
const PAN_EDGE = 5.6;
const PAN_BATTER = 0.34;
/** how far from the road's edge a pan's verge blends into its land (m) */
const PAN_VERGE = 6;
/** a caldera's or a pit's: nothing within this of the centre line, and no steeper than this beyond */
const EDGE = 12;
const BATTER = 1.45;

export interface Pan {
  kind: 'pan';
  index: number;
  /** the stretch of road it lies along in full (m), and how far it fades in before and out after */
  s0: number;
  s1: number;
  fade: number;
  /** its level (m): the salt's; the film stands PAN_FILM over it */
  level: number;
  /** how far either side of the road it lies in full, and where it has ended (m) */
  w0: number;
  w1: number;
  seed: number;
}

export interface Caldera {
  kind: 'caldera';
  index: number;
  /** its centre, and the radius of its rim's crest (m) */
  cx: number;
  cz: number;
  r0: number;
  /** which side of the road its lake lies on: +1 right, −1 left */
  side: number;
  /** the road inside its rim: from … to (m of road) */
  sA: number;
  sB: number;
  /** the levels (m): its lake's, its rim's crest, the road's lowest inside it */
  lake: number;
  crest: number;
  road: number;
  /** how wide its inner wall is under the rim and under the road (m), how wide the shoulder that rises from the road to the crest on its outer side, how far its outer flank runs out */
  wallC: number;
  wallR: number;
  shoulder: number;
  flank: number;
  /** how deep its lake is (m) */
  depth: number;
  /** the cone in its lake: where, how wide at the water, how high over it (null: none) */
  cone: { x: number; z: number; r: number; h: number } | null;
  seed: number;
}

export interface Pit {
  kind: 'pit';
  index: number;
  x: number;
  z: number;
  /** the radius of its lip across its narrow way (m), how much longer it is than wide, the way its long axis lies (cos, sin) */
  r: number;
  stretch: number;
  ca: number;
  sa: number;
  /** how deep its floor lies under the land it is sunk in (m) */
  depth: number;
  /** the arc length of the road beside it */
  s: number;
  seed: number;
}

export type Wonder = Pan | Caldera | Pit;

/** what the great forms make of one point of the land */
export class WonderEffect {
  /** the water standing here: its level (−Infinity: none) and kind (1 a lake, WATER_FILM a pan's film) */
  level = -Infinity;
  kind = 0;
  /** how far from the road's edge its verge may blend into the land at the most (m; Infinity: the region's) */
  verge = Infinity;
  /** how fully the point lies on a pan, 0 … 1 */
  pan = 0;
  /** how much of the land's height here is a great form's rock (m, for whoever paints it: a crater's wall, a pit's) */
  rock = 0;
}

const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** the larger of two heights, rounded where they are within k of each other */
function smax(a: number, b: number, k: number): number {
  const d = k - (a > b ? a - b : b - a);
  if (d <= 0) return a > b ? a : b;
  return (a > b ? a : b) + (d * d * 0.25) / k;
}

/** a wall cut into ledges: of every `step` m of it, most stand steeper and a little is a ledge (how much: `k`, 0 none) */
function ledges(h: number, step: number, k: number): number {
  const q = h / step;
  const f = q - Math.floor(q);
  return h + k * step * (smooth((f - 0.2) / 0.6) - f);
}

/** which of a place's great forms its landform has (null: none) */
export function wonderKindOf(p: EarthPiece): Wonder['kind'] | null {
  if (p.kind !== 'scene' || !p.scene) return null;
  switch (p.scene.place.look.landform.id) {
    case 'salt_flat':
      return 'pan';
    case 'crater_lake':
      return 'caldera';
    case 'sinkholes':
      return 'pit';
    default:
      return null;
  }
}

/**
 * The great forms along a world's road, place by place. `apply` is the land function's: the land's height at a point
 * with the forms of the place it lies abreast of.
 */
export class Wonders {
  private readonly made = new Map<number, readonly Wonder[]>();
  private readonly st = new SpineSample();
  private readonly seed: number;

  constructor(
    private readonly spine: RoadSpine,
    private readonly earth: EarthRoad,
    seed: number,
  ) {
    this.seed = hash2(seed | 0, 0x60d5, 77);
  }

  /** the great forms of a place (none: an empty list), laid out the first time asked, the same after */
  of(p: EarthPiece): readonly Wonder[] {
    let v = this.made.get(p.index);
    if (v === undefined) {
      // (held as none while it is laid out: laying out reads the road, and the road asks nothing of the land)
      this.made.set(p.index, NONE);
      v = this.layout(p);
      this.made.set(p.index, v);
    }
    return v;
  }

  /** the great forms of the place the road is in at arc length s */
  at(s: number): readonly Wonder[] {
    return this.of(this.earth.pieceAt(s));
  }

  private dice(p: EarthPiece, n: number): number {
    return (hash2(p.index * 64 + n, 0x3d1, this.seed) >>> 8) / 16777216;
  }

  private layout(p: EarthPiece): readonly Wonder[] {
    const kind = wonderKindOf(p);
    if (kind === null) return NONE;
    if (kind === 'pan') {
      const w = this.pan(p);
      return w ? [w] : NONE;
    }
    if (kind === 'caldera') {
      const w = this.caldera(p);
      return w ? [w] : NONE;
    }
    return this.pits(p);
  }

  /** a salt flat's pan: along the lowest of its road, as far as the road stays within a few metres of that */
  private pan(p: EarthPiece): Pan | null {
    const sp = this.spine;
    const st = this.st;
    const fade = 360;
    const a = p.start + fade + 40;
    const b = p.end - fade - 40;
    // the longest run of its road that keeps within PAN_RISE of a level: the pan lies under that run's lowest
    const ys: number[] = [];
    for (let s = a; s <= b; s += 20) {
      sp.at(s, st);
      ys.push(st.y);
    }
    let best = 0;
    let i0 = 0;
    let i1 = 0;
    let low: number;
    for (let i = 0; i < ys.length; i++) {
      // (the run from station i on, whose lowest and highest stay within the rise)
      let lo = ys[i];
      let hi = ys[i];
      let k = i;
      while (k + 1 < ys.length) {
        const y = ys[k + 1];
        const nlo = y < lo ? y : lo;
        const nhi = y > hi ? y : hi;
        if (nhi - nlo > PAN_RISE) break;
        lo = nlo;
        hi = nhi;
        k++;
      }
      if (k - i > best) {
        best = k - i;
        i0 = i;
        i1 = k;
      }
      if (k === ys.length - 1) break;
    }
    // (its level under the run's own: the middle of its heights, a dip at either end left out of it)
    const mid = ys.slice(i0, i1 + 1).sort((p, q) => p - q)[(i1 - i0) >> 1];
    while (i0 < i1 && ys[i0] < mid - 0.3) i0++;
    while (i1 > i0 && ys[i1] < mid - 0.3) i1--;
    low = mid;
    for (let i = i0; i <= i1; i++) if (ys[i] + 0.3 < low) low = ys[i] + 0.3;
    const s0 = a + i0 * 20;
    const s1 = a + i1 * 20;
    if (s1 - s0 < 1100) return null;
    const w0 = 2300 + 500 * this.dice(p, 1);
    return { kind: 'pan', index: p.index, s0, s1, fade, level: low - PAN_FREEBOARD, w0, w1: w0 + 850, seed: hash2(p.index, 0x9a2, this.seed) };
  }

  /** a crater lake's caldera: a ring whose rim the road cuts through twice, the road between the two along its inner wall */
  private caldera(p: EarthPiece): Caldera | null {
    const sp = this.spine;
    const st = this.st;
    const len = p.end - p.start;
    const R = Math.max(120, p.scene!.place.macro.relief);
    sp.at(p.start + 80, st);
    const xS = st.x;
    sp.at(p.end - 80, st);
    const xE = st.x;
    const sM = p.start + len * (0.5 + 0.08 * (this.dice(p, 1) - 0.5));
    sp.at(sM, st);
    const mx = st.x;
    const mz = st.z;
    // (the road's right at its middle)
    const rx = -Math.sin(st.phi);
    const rz = Math.cos(st.phi);
    const flank = 520;
    const first = this.dice(p, 2) < 0.5 ? -1 : 1;
    for (let attempt = 0; attempt < 6; attempt++) {
      const side = attempt % 2 === 0 ? first : -first;
      // (half the length of road inside the rim, and how far the middle of that road is from the centre: nearer at each new try)
      let half = 1150 + 260 * this.dice(p, 3);
      let c0 = (980 + 320 * this.dice(p, 4)) * (1 - 0.14 * Math.floor(attempt / 2));
      let r0 = Math.hypot(c0, half);
      let cx = mx + rx * side * c0;
      const room = Math.min(cx - xS, xE - cx) / (r0 + flank);
      if (room < 1) {
        if (room < 0.62) continue;
        half *= room;
        c0 *= room;
        r0 *= room;
        cx = mx + rx * side * c0;
      }
      const cz = mz + rz * side * c0;
      // the road inside the rim: one run of it, round the middle
      const inside = (s: number): boolean => {
        sp.at(s, st);
        return Math.hypot(st.x - cx, st.z - cz) < r0 - 12;
      };
      if (!inside(sM)) continue;
      let sA = sM;
      let sB = sM;
      while (sA - 25 > p.start + 60 && inside(sA - 25)) sA -= 25;
      while (sB + 25 < p.end - 60 && inside(sB + 25)) sB += 25;
      if (sB - sA < 1300 || sA - 25 <= p.start + 60 || sB + 25 >= p.end - 60) continue;
      let lo = Infinity;
      let hi = -Infinity;
      for (let s = sA; s <= sB; s += 25) {
        sp.at(s, st);
        if (st.y < lo) lo = st.y;
        if (st.y > hi) hi = st.y;
      }
      const drop = clamp(0.34 * R, 120, 230);
      const lake = lo - drop;
      const crest = hi + clamp(0.15 * R, 42, 88);
      // (their steepest some three in two of their mean: with their ledges, no steeper than the land can hold)
      const wallC = clamp((crest - lake) * 1.65, 340, 640);
      const wallR = clamp(drop * 1.55, 190, 350);
      // the cone: in the lake's far half from the road, clear of the walls
      let cone: Caldera['cone'] = null;
      if (this.dice(p, 9) < 0.8) {
        const turn = (this.dice(p, 10) - 0.5) * 1.5;
        const dx = rx * side;
        const dz = rz * side;
        const out = r0 * (0.08 + 0.2 * this.dice(p, 11));
        const kx = cx + (dx * Math.cos(turn) - dz * Math.sin(turn)) * out;
        const kz = cz + (dx * Math.sin(turn) + dz * Math.cos(turn)) * out;
        const room2 = (r0 - Math.hypot(kx - cx, kz - cz) - wallC - 60) / 1.5;
        const r = Math.min(240 + 150 * this.dice(p, 12), room2);
        if (r > 150) cone = { x: kx, z: kz, r, h: r * (0.24 + 0.1 * this.dice(p, 13)) };
      }
      return { kind: 'caldera', index: p.index, cx, cz, r0, side, sA, sB, lake, crest, road: lo, wallC, wallR, shoulder: 150 + 90 * this.dice(p, 5), flank, depth: 46 + 30 * this.dice(p, 6), cone, seed: hash2(p.index, 0x9a3, this.seed) };
    }
    return null;
  }

  /** a karst's great pits: the first at the road's edge, the others out in its country */
  private pits(p: EarthPiece): readonly Wonder[] {
    const sp = this.spine;
    const st = this.st;
    const out: Pit[] = [];
    const len = p.end - p.start;
    const R = Math.max(60, p.scene!.place.macro.relief);
    sp.at(p.start + 60, st);
    const xS = st.x;
    sp.at(p.end - 60, st);
    const xE = st.x;
    const n = 3 + Math.floor(this.dice(p, 1) * 2.99);
    const show = Math.floor(this.dice(p, 2) * 2.99);
    for (let i = 0; i < n; i++) {
      const q = (j: number): number => this.dice(p, 20 + i * 12 + j);
      const near = i === show || (i === show + 2 && q(11) < 0.5);
      const s = p.start + len * ((i + 0.5 + 0.5 * (q(0) - 0.5)) / n);
      const r = near ? 150 + 110 * q(1) : 100 + 150 * q(1);
      const stretch = 1 + 0.5 * q(2) * q(2);
      const side = q(3) < 0.5 ? -1 : 1;
      let gap = near ? 26 + 16 * q(4) : 150 + 520 * q(4) * q(4);
      sp.at(s, st);
      const px = st.x;
      const pz = st.z;
      const rx = -Math.sin(st.phi);
      const rz = Math.cos(st.phi);
      // (its long way along the road, turned a little)
      const turn = st.phi + (q(5) - 0.5) * 0.9;
      const ca = Math.cos(turn);
      const sa = Math.sin(turn);
      let x = 0;
      let z = 0;
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        x = px + rx * side * (gap + r);
        z = pz + rz * side * (gap + r);
        ok = true;
        let worst = 0;
        const reach = r * stretch + 260;
        for (let t = s - reach; t <= s + reach; t += 10) {
          sp.at(t < 0 ? 0 : t, st);
          const dx = st.x - x;
          const dz = st.z - z;
          const u = (dx * ca + dz * sa) / stretch;
          const v = -dx * sa + dz * ca;
          const d = Math.sqrt(u * u + v * v);
          // (its lip's wobble and the lip's rounding are inside this)
          const need = r * 1.12 + 20;
          if (d < need) {
            ok = false;
            if (need - d > worst) worst = need - d;
          }
        }
        if (!ok) gap += worst + 4;
      }
      if (!ok) continue;
      const reach = r * stretch * 1.14 + 8;
      if (x - reach < xS || x + reach > xE) continue;
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) < (o.r * o.stretch + r * stretch) * 1.2 + 30)) continue;
      // (as deep as its country is high, and no deeper than leaves it a floor)
      const depth = Math.min(clamp(R * (0.5 + 0.5 * q(6)), 70, 230), PIT_SLOPE * (r - 50));
      if (depth < 55) continue;
      out.push({ kind: 'pit', index: p.index, x, z, r, stretch, ca, sa, depth, s, seed: hash2(p.index * 16 + i, 0x9a4, this.seed) });
    }
    return out;
  }

  /**
   * The land's height at (x, z) with the great forms of the place it lies abreast of.
   * @param s the arc length of the road point with the same x
   * @param lat how far the point is to the right of that road point across the road (m; negative: left)
   * @param ad its distance from the road (m)
   * @param base the road's level beside it (m)
   * @param T the land's height as it lies without them (m)
   * @param coarse for the far ring's coarse land
   */
  apply(x: number, z: number, s: number, lat: number, ad: number, base: number, T: number, coarse: boolean, out: WonderEffect): number {
    out.level = -Infinity;
    out.kind = 0;
    out.verge = Infinity;
    out.pan = 0;
    out.rock = 0;
    const ws = this.at(s);
    if (ws.length === 0) return T;
    let h = T;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.kind === 'pan') h = panAt(w, s, lat, ad, h, coarse, out);
      else if (w.kind === 'caldera') h = calderaAt(w, x, z, lat, ad, base, h, out);
      else h = pitAt(w, x, z, ad, h, out);
    }
    return h;
  }

  /** how far (x, z) is from the nearest edge of a great form's water (m; Infinity: none near), 0 in it; s as `apply`'s */
  shore(x: number, z: number, s: number, lat: number): number {
    const ws = this.at(s);
    let best = Infinity;
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (w.kind !== 'caldera') continue;
      // (its water's edge: under its rim, some way down its wall; under the road, the same)
      const r = Math.hypot(x - w.cx, z - w.cz);
      const e = w.side * lat;
      const inC = w.r0 - r - w.wallC * 0.86;
      const inR = e - w.wallR * 0.86;
      const d = -Math.min(inC, inR);
      if (d < best) best = d < 0 ? 0 : d;
    }
    return best;
  }
}

const NONE: readonly Wonder[] = [];
/** a pit's wall: how steep (rise over run: the land's steepest, features.ts MAX_SLOPE, less a little), and over how many metres its lip rounds into it */
const PIT_SLOPE = 1.6;
const PIT_LIP = 8;

function panAt(w: Pan, s: number, lat: number, ad: number, T: number, coarse: boolean, out: WonderEffect): number {
  const a = lat < 0 ? -lat : lat;
  if (a >= w.w1 || s <= w.s0 - w.fade || s >= w.s1 + w.fade) return T;
  const k = smooth((s - (w.s0 - w.fade)) / w.fade) * (1 - smooth((s - w.s1) / w.fade)) * (1 - smooth((a - w.w0) / (w.w1 - w.w0)));
  if (k <= 0) return T;
  // (the far ring's coarse land a little under the sheet that is drawn over it)
  let d = (w.level - (coarse ? 0.35 : 0) - T) * k;
  // the causeway's bank
  const lim = PAN_BATTER * (ad - PAN_EDGE);
  if (lim <= 0) return T;
  if (d < -lim) d = -lim;
  else if (d > lim) d = lim;
  out.level = w.level + PAN_FILM;
  out.kind = WATER_FILM;
  out.pan = k;
  if (k > 0.5) out.verge = PAN_VERGE;
  return T + d;
}

function calderaAt(w: Caldera, x: number, z: number, lat: number, ad: number, base: number, T: number, out: WonderEffect): number {
  const dx = x - w.cx;
  const dz = z - w.cz;
  const reach = w.r0 * 1.06 + w.flank;
  if (dx > reach || dx < -reach || dz > reach || dz < -reach) return T;
  const r = Math.sqrt(dx * dx + dz * dz);
  if (r >= reach) return T;
  // round the rim: its crest higher here and lower there, its line in and out a little
  const ux = r > 1 ? dx / r : 1;
  const uz = r > 1 ? dz / r : 0;
  const n1 = fbm2(ux * 1.9 + 31, uz * 1.9 - 12, w.seed, 3);
  const n2 = fbm2(ux * 1.3 - 7, uz * 1.3 + 44, w.seed + 5, 2);
  const span = w.crest - w.road;
  const crest = w.crest + 0.42 * span * n1;
  const u = w.r0 * (1 + 0.035 * n2) - r;
  const e = w.side * lat;
  // (the walls go on down under the water: they plunge into it)
  const under = w.lake - 22;
  let S: number;
  if (e > 0 && u > 0) {
    // inside: the wall under the rim, the wall under the road, whichever stands higher; the lake's bed beyond both
    const gully = 1 + 0.14 * fbm2(ux * 6.5 + 3, uz * 6.5 + 9, w.seed + 9, 2);
    const tc = u / (w.wallC * gully);
    // (by how far the point lies across the road from it, which is one measure wherever it is asked from)
    const tr = e / w.wallR;
    // (where the country outside stands over the rim's crest, the wall begins from the country's height: no step at the rim's line)
    const zc = under + ((crest > T ? crest : T) - under) * (1 - smooth(tc));
    const zr = under + (Math.max(base, under) - under) * (1 - smooth(tr));
    S = smax(zc, zr, 14);
    if (S > w.lake + 3) {
      // ledges: the flows it is built of, one over another
      // (none at the crest, none at the road's own edge, none at the water's)
      const step = (w.crest - w.lake) / 6.5;
      const kl = 0.28 * smooth((S - w.lake - 3) / 12) * smooth((crest - S) / 14) * (zr > zc ? smooth((base - S) / 10) : 1);
      S = w.lake + ledges(S - w.lake, step, kl);
      // (ribs down it)
      S += 0.035 * (w.crest - w.lake) * fbm2(ux * 13 + 5, uz * 13 - 3, w.seed + 13, 2) * smooth((S - w.lake) / 30) * smooth(Math.min(u, e) / 60);
    }
    const m = tc < tr ? tc : tr;
    if (m > 1) S -= w.depth * smooth((m - 1) / 1.4);
    if (w.cone) {
      const cdx = x - w.cone.x;
      const cdz = z - w.cone.z;
      const cr = w.cone.r * 1.5;
      const d2 = cdx * cdx + cdz * cdz;
      if (d2 < cr * cr) {
        // (it stands on the lake's bed: its foot the bed's, its rim w.cone.h over the water)
        S += (w.lake + w.cone.h - S) * featureProfile('cone', Math.sqrt(d2) / cr);
      }
    }
    out.level = w.lake;
    out.kind = 1;
  } else {
    // outside the rim's line, or beyond the road from the lake: the rim's shoulder and its flank down to the country
    const k = u > 0 ? 1 : 1 - smooth(-u / w.flank);
    if (k <= 0) return T;
    let top = crest;
    if (e <= 0) {
      const up = smooth(-e / w.shoulder);
      top = base + (crest - base) * up;
    }
    S = top > T ? T + (top - T) * k * (2 - k) : T;
  }
  let d = S - T;
  // (a cutting's side by the road; no bound from a hundred metres or two out, where the road's distance is no longer measured exactly)
  const lim = BATTER * (ad - EDGE) * (1 + 5 * smooth((ad - 100) / 70));
  if (lim <= 0) return T;
  if (d < -lim) d = -lim;
  else if (d > lim) d = lim;
  if (S > w.lake + 2) out.rock = Math.max(out.rock, Math.abs(d));
  return T + d;
}

function pitAt(w: Pit, x: number, z: number, ad: number, T: number, out: WonderEffect): number {
  const dx = x - w.x;
  const dz = z - w.z;
  // (round its lip the land dips towards it, a funnel some tens of metres wide: from the road beside it the eye goes over
  // the near lip to the far wall)
  const collar = clamp(0.3 * w.r, 30, 70);
  const reach = (w.r * 1.12 + collar) * w.stretch + 12;
  if (dx > reach || dx < -reach || dz > reach || dz < -reach) return T;
  const a = (dx * w.ca + dz * w.sa) / w.stretch;
  const b = -dx * w.sa + dz * w.ca;
  const d0 = Math.sqrt(a * a + b * b);
  // (its lip in and out round it)
  const ux = d0 > 1 ? a / d0 : 1;
  const uz = d0 > 1 ? b / d0 : 0;
  const rr = w.r * (1 + 0.1 * fbm2(ux * 0.9 + 3, uz * 0.9 - 8, w.seed, 1));
  if (d0 >= rr + collar) return T;
  const funnel = 0.07 * w.depth;
  // from the lip in: the land as it lies, let down over a round lip and then as steeply as the land can hold — to the
  // floor, the fallen rock heaped on it and banked against the wall's foot
  let d: number;
  if (d0 >= rr) d = -funnel * smooth(1 - (d0 - rr) / collar);
  else {
    const inn = rr - d0;
    const g = inn < PIT_LIP ? (PIT_SLOPE * inn * inn) / (2 * PIT_LIP) : PIT_SLOPE * (inn - PIT_LIP / 2);
    const deep = w.depth * (1 - 0.09 * (0.5 + 0.5 * fbm2(dx / 70 + 1.3, dz / 70 - 4.1, w.seed + 3, 3)));
    d = -funnel - (deep - smax(deep - g, 0, 22));
  }
  const lim = BATTER * (ad - EDGE);
  if (lim <= 0) return T;
  if (d < -lim) d = -lim;
  if (d0 < rr) out.rock = Math.max(out.rock, -d - funnel);
  return T + d;
}
