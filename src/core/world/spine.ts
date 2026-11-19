/**
 * Road spine: the endless centre line every other part of the world hangs from.
 *
 * It is produced station by station (every 2 m) by a small deterministic process:
 *   plan     straights and curves chosen from the current biome's road style;
 *   plan     curvature slews at a limited rate, which gives clothoid-like transitions;
 *   profile  grade follows a smooth target with limited rate, so crests and sags are gentle;
 *   guard    heading stays within ~±60° of +x, so x always increases along the road — the
 *            road can never cross itself and the world can be indexed by x.
 *
 * Same seed → same road on every machine: only integer hashing, + − × ÷ and our own sin/cos.
 */
import { dcos, dsin } from '../math/detmath';
import { fbm1 } from '../math/noise';
import { Rng, hash2 } from '../math/rng';
import { clamp, smoothstep } from '../math/util';
import type { DrivePath, PathProbe } from '../driver/robot';
import { BIOMES, minRadius, type BiomeDef } from './biomes';
import { baseAt, baseOf } from './relief';
import { rulesFor, type DealerView, type DealtChapter, type WorldRules, type WorldVersion } from './rules';

const DEG = Math.PI / 180;
const G = 9.81;

export interface SpineOptions {
  /** multiplies chapter (biome) lengths; < 1 packs biomes closer for tests and screenshots */
  chapterScale?: number;
  /** id of the first biome */
  startBiome?: string;
  /**
   * Where the road begins (s = 0, heading +x) and at what height: by default the origin, at the first biome's
   * base elevation. The road's whole profile is the same either way, carried by the difference (ModCar: the
   * road begins at its workshop's gate, level with the yard).
   */
  start?: { x: number; z: number; y?: number };
  /**
   * Which version of the generator makes the world (rules.ts). Absent: 1, the generator every world was
   * made by before there were versions — the same world to the bit, whatever has been added since.
   */
  worldVersion?: WorldVersion;
  /**
   * How many entries of the region registry (biomes.ts BIOMES) the world knows; its dealer deals none
   * beyond them. Absent: six for version 1, the whole registry for version 2. A save keeps the count: the
   * registry only grows at its end, so a world made when it held twelve regions is the same world when
   * it holds twenty.
   */
  regionCount?: number;
}

export class BiomeBlend {
  a = 0;
  b = 0;
  /** 0 = all a, 1 = all b */
  t = 0;
  /** the chapters a and b belong to (the renderer keeps one palette slot per chapter) */
  ia = 0;
  ib = 0;
}

export class SpineSample {
  x = 0;
  y = 0;
  z = 0;
  phi = 0;
  kappa = 0;
  grade = 0;
  /** cross slope: rise per metre towards the right */
  bank = 0;
}

/**
 * The sequence of biomes along the road. Which region each chapter runs through and how long it lasts is
 * its dealer's business (rules.ts: the world's rules name the dealer); the plan keeps what was dealt, in
 * order, and answers for any point of the road.
 */
export class ChapterPlan {
  readonly starts: number[] = [0];
  readonly biomes: number[] = [];
  /** length of the zone over which two biomes blend (m) */
  readonly transition: number;
  /** what the dealer is shown: the world's identity and the chapters so far (the two lists above, as they grow) */
  private readonly deal: DealerView;

  /**
   * @param seed the world's seed
   * @param first the region the journey is asked to begin in (an index into BIOMES)
   * @param rules the world's rules (absent: version 1's)
   */
  constructor(
    readonly seed: number,
    readonly scale: number,
    first: number,
    readonly rules: WorldRules = rulesFor(1),
  ) {
    this.transition = rules.transition(scale);
    this.deal = { seed, scale, startRegion: first, rules, regions: this.biomes, starts: this.starts, rng: new Rng(hash2(seed, 0xb10e, 77)) };
    this.take(rules.dealer.first(this.deal));
  }

  private extend(): void {
    this.take(this.rules.dealer.next(this.deal));
  }

  /** the next chapter, as dealt: a region the world knows, and a length */
  private take(d: DealtChapter): void {
    if (!Number.isInteger(d.region) || d.region < 0 || d.region >= this.rules.regionCount) {
      throw new RangeError(`chapter ${this.biomes.length}: the dealer dealt region ${String(d.region)}, and this world knows regions 0 to ${this.rules.regionCount - 1}`);
    }
    if (!(d.length > 0 && d.length < Infinity)) throw new RangeError(`chapter ${this.biomes.length}: the dealer dealt a length of ${String(d.length)} m`);
    this.biomes.push(d.region);
    this.starts.push(this.starts[this.starts.length - 1] + d.length);
  }

  blend(s: number, out: BiomeBlend): void {
    while (this.starts[this.starts.length - 1] < s + this.transition) this.extend();
    // chapter i covers [starts[i], starts[i+1])
    let i = this.biomes.length - 1;
    while (i > 0 && this.starts[i] > s) i--;
    const half = this.transition / 2;
    const toNext = this.starts[i + 1] - s;
    const fromPrev = s - this.starts[i];
    if (toNext < half && i + 1 < this.biomes.length) {
      out.a = this.biomes[i];
      out.b = this.biomes[i + 1];
      out.ia = i;
      out.ib = i + 1;
      out.t = 0.5 * smoothstep(0, 1, 1 - toNext / half);
    } else if (fromPrev < half && i > 0) {
      out.a = this.biomes[i - 1];
      out.b = this.biomes[i];
      out.ia = i - 1;
      out.ib = i;
      out.t = 0.5 + 0.5 * smoothstep(0, 1, fromPrev / half);
    } else {
      out.a = out.b = this.biomes[i];
      out.ia = out.ib = i;
      out.t = 0;
    }
  }

  /** the biome of chapter c (chapters are laid out as far as asked) */
  biomeOf(c: number): number {
    while (this.biomes.length <= c) this.extend();
    return this.biomes[c < 0 ? 0 : c];
  }

  /** index of the chapter containing s */
  chapterAt(s: number): number {
    while (this.starts[this.starts.length - 1] < s) this.extend();
    let i = this.biomes.length - 1;
    while (i > 0 && this.starts[i] > s) i--;
    return i;
  }
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class RoadSpine implements DrivePath {
  readonly ds = 2;
  readonly seed: number;
  /** the rules of the world this road belongs to (rules.ts): whoever holds the road holds them */
  readonly rules: WorldRules;
  readonly plan: ChapterPlan;
  /** number of stations generated so far */
  count = 0;
  xs: Float64Array = new Float64Array(8192);
  zs: Float64Array = new Float64Array(8192);
  ys: Float64Array = new Float64Array(8192);
  phi: Float64Array = new Float64Array(8192);
  kap: Float64Array = new Float64Array(8192);
  grd: Float64Array = new Float64Array(8192);
  bnk: Float64Array = new Float64Array(8192);

  // generator state (values at the next station to be stored)
  private gx = 0;
  private gz = 0;
  private gy: number;
  private gphi = 0;
  private gkap = 0;
  private ggrade = 0;
  private segLeft = 160;
  private kTarget = 0;
  private wasCurve = false;
  private readonly rng: Rng;
  private readonly gradeSeed: number;
  private readonly bl = new BiomeBlend();
  private cursor = 0;
  private readonly tmp = new SpineSample();
  /**
   * The start's height less the first region's base elevation: the profile's pull towards each region's base is
   * carried by it. So it is the height of the sea's level in the world's own heights: a height above the sea is
   * y − lift (`altitude`).
   */
  readonly lift: number;
  // the world's road rules (rules.ts RoadRules), read once: the heading guards in radians, the radius floor, the grade cap
  private readonly headingSoft: number;
  private readonly headingLimit: number;
  private readonly headingRoom: number;
  private readonly headingHard: number;
  private readonly radiusFloor: number;
  private readonly gradeCap: number;
  private readonly pull: number;
  private readonly pullLen: number;
  /** a world of version 2: the base elevation is each region's RegionRelief.base over the long blend (relief.ts baseAt) */
  private readonly longBase: boolean;

  /** @param rules the world's rules, when a world makes its road; a road made by itself works them out from the same options */
  constructor(seed: number, opts: SpineOptions = {}, rules: WorldRules = rulesFor(opts.worldVersion, opts)) {
    this.seed = seed | 0;
    this.rules = rules;
    const road = rules.road;
    this.headingSoft = road.headingSoft * DEG;
    this.headingLimit = road.headingLimit * DEG;
    this.headingRoom = road.headingRoom * DEG;
    this.headingHard = road.headingHard * DEG;
    this.radiusFloor = road.radiusFloor;
    this.gradeCap = road.gradeCap;
    this.pull = road.pull;
    this.pullLen = road.pullLen;
    this.longBase = road.longBase;
    // (a first biome the world does not know — no such id, or one registered after the world's count — is the first of all)
    let first = BIOMES.findIndex((b) => b.id === (opts.startBiome ?? 'plains'));
    if (first < 0 || first >= rules.regionCount) first = 0;
    this.plan = new ChapterPlan(this.seed, opts.chapterScale ?? 1, first, rules);
    this.rng = new Rng(hash2(this.seed, 0x50ad, 13));
    this.gradeSeed = hash2(this.seed, 0x6ade, 5);
    // (the country the journey does begin in: chapter 0 as it was dealt)
    const home = this.longBase ? baseOf(this.plan.biomes[0]) : BIOMES[this.plan.biomes[0]].baseElev;
    this.gx = opts.start?.x ?? 0;
    this.gz = opts.start?.z ?? 0;
    this.gy = opts.start?.y ?? home;
    this.lift = this.gy - home;
    this.ensure(400);
  }

  private grow(): void {
    const n = this.xs.length * 2;
    const g = (a: Float64Array): Float64Array => {
      const b = new Float64Array(n);
      b.set(a);
      return b;
    };
    this.xs = g(this.xs);
    this.zs = g(this.zs);
    this.ys = g(this.ys);
    this.phi = g(this.phi);
    this.kap = g(this.kap);
    this.grd = g(this.grd);
    this.bnk = g(this.bnk);
  }

  /** road style blended between two biomes */
  private style(key: keyof BiomeDef): number {
    const bl = this.bl;
    const a = BIOMES[bl.a][key] as number;
    if (bl.t <= 0) return a;
    return mix(a, BIOMES[bl.b][key] as number, bl.t);
  }

  private pickSegment(rMin: number): void {
    const rng = this.rng;
    if (this.wasCurve && rng.chance(this.style('straightChance'))) {
      this.kTarget = 0;
      this.segLeft = rng.range(this.style('straightMin'), this.style('straightMax'));
      this.wasCurve = false;
      return;
    }
    // a curve: prefer the direction that brings the heading back towards +x
    const soft = this.headingSoft;
    const pRight = 0.5 - 0.5 * clamp(this.gphi / soft, -1, 1);
    let dir = rng.chance(pRight) ? 1 : -1;
    const u = rng.next();
    const R = rMin * (1 + (this.style('radiusSpread') - 1) * u * Math.sqrt(u));
    let turn = rng.range(this.style('turnMin'), this.style('turnMax')) * DEG;
    const limit = this.headingLimit;
    let room = dir > 0 ? limit - this.gphi : limit + this.gphi;
    if (room < this.headingRoom) {
      dir = -dir;
      room = dir > 0 ? limit - this.gphi : limit + this.gphi;
    }
    if (turn > room) turn = room;
    this.kTarget = dir / R;
    this.segLeft = Math.max(20, R * turn);
    this.wasCurve = true;
  }

  private gen(): void {
    if (this.count >= this.xs.length) this.grow();
    const i = this.count;
    const ds = this.ds;
    const s = i * ds;
    this.plan.blend(s, this.bl);
    // The road style of the two biomes this station lies between, mixed as `style` mixes it, but with
    // each field read by its own name: once a station, a field looked up by a name that varies costs
    // several times as much, and more again on an object of more than thirty-two fields (a region's).
    const A = BIOMES[this.bl.a];
    const B = BIOMES[this.bl.b];
    const t = this.bl.t;
    const designV = (t <= 0 ? A.designKmh : mix(A.designKmh, B.designKmh, t)) / 3.6;
    const rMin = Math.max(this.radiusFloor, mix(minRadius(A.designKmh), minRadius(B.designKmh), t));

    // store the station
    this.xs[i] = this.gx;
    this.zs[i] = this.gz;
    this.ys[i] = this.gy;
    this.phi[i] = this.gphi;
    this.kap[i] = this.gkap;
    this.grd[i] = this.ggrade;
    this.bnk[i] = -clamp(((designV * designV * this.gkap) / G) * 0.45, -0.07, 0.07);
    this.count = i + 1;

    // ---- advance to the next station
    if (this.segLeft <= 0) this.pickSegment(rMin);
    let target = this.kTarget;
    // never ask for a tighter curve than the local minimum (matters when entering a faster biome mid-curve)
    target = clamp(target, -1 / rMin, 1 / rMin);
    const kRate = 1 / (rMin * 55);
    // heading guard, looking ahead: where would the heading end up if the curve started to unwind now?
    const hard = this.headingHard;
    const pred = this.gphi + (this.gkap * Math.abs(this.gkap)) / (2 * kRate);
    if (pred > hard && target >= 0) target = -1 / (rMin * 1.3);
    else if (pred < -hard && target <= 0) target = 1 / (rMin * 1.3);
    this.gkap += clamp(target - this.gkap, -kRate * ds, kRate * ds);
    const pm = this.gphi + this.gkap * ds * 0.5;
    this.gx += dcos(pm) * ds;
    this.gz += dsin(pm) * ds;
    this.gphi += this.gkap * ds;

    const gMax = t <= 0 ? A.gradeMax : mix(A.gradeMax, B.gradeMax, t);
    const gAmp = t <= 0 ? A.gradeAmp : mix(A.gradeAmp, B.gradeAmp, t);
    const gLen = t <= 0 ? A.gradeLen : mix(A.gradeLen, B.gradeLen, t);
    const baseElev = this.longBase ? baseAt(this.plan, s) : t <= 0 ? A.baseElev : mix(A.baseElev, B.baseElev, t);
    let gT = gAmp * 1.6 * fbm1(s / gLen, this.gradeSeed, 2);
    gT -= clamp((this.gy - this.lift - baseElev) / this.pullLen, -this.pull, this.pull);
    gT = clamp(gT, -gMax, gMax);
    const gRate = 0.00065;
    this.ggrade += clamp(gT - this.ggrade, -gRate * ds, gRate * ds);
    this.ggrade = clamp(this.ggrade, -this.gradeCap, this.gradeCap);
    this.gy += this.ggrade * ds;
    this.segLeft -= ds;
  }

  /** make sure stations exist up to arc length sMax */
  ensure(sMax: number): void {
    const need = Math.floor(sMax / this.ds) + 3;
    while (this.count < need) this.gen();
  }

  /** make sure stations exist beyond world x */
  ensureX(x: number): void {
    while (this.xs[this.count - 1] < x) {
      const need = this.count + 256;
      while (this.count < need) this.gen();
    }
  }

  get length(): number {
    return (this.count - 1) * this.ds;
  }

  /** how high above the sea a height of the world's is (m): the world's heights are the road's, which begins at its start's height (`lift`) */
  altitude(y: number): number {
    return y - this.lift;
  }

  /** Interpolated road state at arc length s. Behind the start the road continues straight. */
  at(s: number, out: SpineSample): void {
    if (s <= 0) {
      out.x = this.xs[0] + s;
      out.z = this.zs[0];
      out.y = this.ys[0];
      out.phi = 0;
      out.kappa = 0;
      out.grade = 0;
      out.bank = 0;
      return;
    }
    const fi = s / this.ds;
    let i = Math.floor(fi);
    if (i + 1 >= this.count) {
      this.ensure(s + this.ds * 2);
      if (i + 1 >= this.count) i = this.count - 2;
    }
    const f = fi - i;
    const g = 1 - f;
    out.x = this.xs[i] * g + this.xs[i + 1] * f;
    out.z = this.zs[i] * g + this.zs[i + 1] * f;
    out.y = this.ys[i] * g + this.ys[i + 1] * f;
    out.phi = this.phi[i] * g + this.phi[i + 1] * f;
    out.kappa = this.kap[i] * g + this.kap[i + 1] * f;
    out.grade = this.grd[i] * g + this.grd[i + 1] * f;
    out.bank = this.bnk[i] * g + this.bnk[i + 1] * f;
  }

  /** Arc length of the road point that has world x (x increases monotonically along the road). */
  sAtX(x: number): number {
    if (x <= this.xs[0]) return x - this.xs[0];
    this.ensureX(x + 8);
    const xs = this.xs;
    let c = this.cursor;
    if (c > this.count - 2) c = this.count - 2;
    if (xs[c] > x || xs[c + 1] < x) {
      if (xs[c] <= x && x - xs[c] < 64) {
        while (xs[c + 1] < x) c++;
      } else if (xs[c] > x && xs[c] - x < 64) {
        while (xs[c] > x) c--;
      } else {
        let lo = 0;
        let hi = this.count - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (xs[mid] <= x) lo = mid;
          else hi = mid;
        }
        c = lo;
      }
    }
    this.cursor = c;
    return (c + (x - xs[c]) / (xs[c + 1] - xs[c])) * this.ds;
  }

  project(x: number, z: number, hint: number, out: { s: number; d: number }): void {
    const p = this.tmp;
    let s = hint;
    let useHint = false;
    if (hint === hint && hint > -1e8) {
      this.at(hint, p);
      const dx = x - p.x;
      const dz = z - p.z;
      useHint = dx * dx + dz * dz < 60 * 60;
    }
    if (!useHint) s = this.sAtX(x);
    let cs = 1;
    let sn = 0;
    for (let k = 0; k < 7; k++) {
      this.at(s, p);
      cs = Math.cos(p.phi);
      sn = Math.sin(p.phi);
      // on the inside of a curve a metre along the tangent is more than a metre of road
      const kd = p.kappa * (-(x - p.x) * sn + (z - p.z) * cs);
      const along = (x - p.x) * cs + (z - p.z) * sn;
      s += kd > -0.7 && kd < 0.7 ? along / (1 - kd) : along;
      if (along < 0.01 && along > -0.01) break;
    }
    this.at(s, p);
    cs = Math.cos(p.phi);
    sn = Math.sin(p.phi);
    out.s = s;
    out.d = -(x - p.x) * sn + (z - p.z) * cs;
  }

  probe(s: number, out: PathProbe): void {
    const p = this.tmp;
    this.at(s, p);
    out.x = p.x;
    out.y = p.y;
    out.z = p.z;
    out.tx = Math.cos(p.phi);
    out.tz = Math.sin(p.phi);
    out.kappa = p.kappa;
  }

  /** biome mix at arc length s */
  biomeAt(s: number, out: BiomeBlend): void {
    this.plan.blend(s < 0 ? 0 : s, out);
  }

  /** FNV-style hash of the first n stations: equal hashes ⇒ identical roads */
  hash(n: number): number {
    this.ensure(n * this.ds);
    let h = 0x811c9dc5;
    const f = new Float64Array(1);
    const u = new Uint32Array(f.buffer);
    const mixIn = (v: number): void => {
      f[0] = v;
      h = Math.imul(h ^ u[0], 0x01000193);
      h = Math.imul(h ^ u[1], 0x01000193);
    };
    for (let i = 0; i < n; i++) {
      mixIn(this.xs[i]);
      mixIn(this.zs[i]);
      mixIn(this.ys[i]);
      mixIn(this.phi[i]);
    }
    return h >>> 0;
  }
}
