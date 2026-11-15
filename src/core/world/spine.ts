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
import { BIOMES, MIN_RADIUS_ANY, minRadius, type BiomeDef, FIRST_BIOMES } from './biomes';

const DEG = Math.PI / 180;
const G = 9.81;

export interface SpineOptions {
  /** multiplies chapter (biome) lengths; < 1 packs biomes closer for tests and screenshots */
  chapterScale?: number;
  /** id of the first biome */
  startBiome?: string;
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

/** The sequence of biomes along the road. */
export class ChapterPlan {
  readonly starts: number[] = [0];
  readonly biomes: number[] = [];
  /** length of the zone over which two biomes blend (m) */
  readonly transition: number;
  private readonly rng: Rng;

  constructor(
    seed: number,
    readonly scale: number,
    first: number,
  ) {
    this.rng = new Rng(hash2(seed, 0xb10e, 77));
    this.biomes.push(first);
    this.transition = Math.max(300, 900 * Math.min(1, scale * 2));
    // the first chapter is a short, gentle introduction
    this.starts.push(this.rng.range(6000, 9000) * scale);
  }

  private extend(): void {
    const c = this.biomes.length;
    const prev = this.biomes[c - 1];
    // The first four chapters are drawn from the three kinds of country the journey begins in (and
    // drawn exactly as they always were: one number, the other two in order); from the fifth on every
    // kind may come, never the one just left nor the one before it.
    const before = c >= 2 ? this.biomes[c - 2] : -1;
    const pool: number[] = [];
    for (let b = 0; b < (c < 4 ? FIRST_BIOMES : BIOMES.length); b++) if (b !== prev && (c < 4 || b !== before)) pool.push(b);
    const next = pool[this.rng.int(pool.length)];
    this.biomes.push(next);
    this.starts.push(this.starts[this.starts.length - 1] + this.rng.range(10000, 18000) * this.scale);
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

  constructor(seed: number, opts: SpineOptions = {}) {
    this.seed = seed | 0;
    const first = Math.max(0, BIOMES.findIndex((b) => b.id === (opts.startBiome ?? 'plains')));
    this.plan = new ChapterPlan(this.seed, opts.chapterScale ?? 1, first);
    this.rng = new Rng(hash2(this.seed, 0x50ad, 13));
    this.gradeSeed = hash2(this.seed, 0x6ade, 5);
    this.gy = BIOMES[first].baseElev;
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
    const soft = 40 * DEG;
    const pRight = 0.5 - 0.5 * clamp(this.gphi / soft, -1, 1);
    let dir = rng.chance(pRight) ? 1 : -1;
    const u = rng.next();
    const R = rMin * (1 + (this.style('radiusSpread') - 1) * u * Math.sqrt(u));
    let turn = rng.range(this.style('turnMin'), this.style('turnMax')) * DEG;
    const limit = 44 * DEG;
    let room = dir > 0 ? limit - this.gphi : limit + this.gphi;
    if (room < 8 * DEG) {
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
    const designV = this.style('designKmh') / 3.6;
    const rMin = Math.max(MIN_RADIUS_ANY, mix(minRadius(BIOMES[this.bl.a].designKmh), minRadius(BIOMES[this.bl.b].designKmh), this.bl.t));

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
    const hard = 49 * DEG;
    const pred = this.gphi + (this.gkap * Math.abs(this.gkap)) / (2 * kRate);
    if (pred > hard && target >= 0) target = -1 / (rMin * 1.3);
    else if (pred < -hard && target <= 0) target = 1 / (rMin * 1.3);
    this.gkap += clamp(target - this.gkap, -kRate * ds, kRate * ds);
    const pm = this.gphi + this.gkap * ds * 0.5;
    this.gx += dcos(pm) * ds;
    this.gz += dsin(pm) * ds;
    this.gphi += this.gkap * ds;

    const gMax = this.style('gradeMax');
    let gT = this.style('gradeAmp') * 1.6 * fbm1(s / this.style('gradeLen'), this.gradeSeed, 2);
    gT -= clamp((this.gy - this.style('baseElev')) / 2500, -0.035, 0.035);
    gT = clamp(gT, -gMax, gMax);
    const gRate = 0.00065;
    this.ggrade += clamp(gT - this.ggrade, -gRate * ds, gRate * ds);
    this.ggrade = clamp(this.ggrade, -0.08, 0.08);
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
