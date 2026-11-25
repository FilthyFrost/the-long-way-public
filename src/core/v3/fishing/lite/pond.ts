/**
 * The pond (docs/V3/nodes/F2-fishing-lite.md §3): the water in reach of the jetty holds a fixed number of fish,
 * each one real — its kind, its size, where it lives — from the moment it is stocked, so the shadow one sees is the
 * fish one catches. A new stock comes at five every morning; one fish more every couple of minutes while the pond
 * is below half. A fish landed is gone for the day; one that got away is still there, only shy for a while.
 *
 * Below the lord every water is alike (docs/V3/plan/fishing-feel.md §10): the common to the epic fish in it are of all
 * ten waters' kinds, in shares that keep every rarity there, each fish's kind drawn by chance among its rarity's with the
 * first waters' kinds the commonest (fish.ts kindWeight, §11); and a bait of a rarity cast where none of its rarity is
 * in reach has one brought in near it (bringIn), so no wait is empty. The water's lord is in it on most days (never
 * three days running without), its celestial fish only while its moment of the sky lasts: those two keep to their own
 * water. Now and then a shoal boils at the surface, or one rare fish turns hungry and rings the water gold.
 *
 * Local axes: the angler stands at the origin at the jetty's end, z is out over the water, x across it.
 */
import { FISH, fishOfSpot, fishOfTier, pickKind } from './fish';
import { SPOTS, FAN, REACH_MAX, zonesOf } from './spots';
import { dice, rollLength, staminaOf, strengthOf, Stream } from './rules';
import { TIERS, type FishDef, type Family } from './types';

// ------------------------------------------------------------------ the water in reach

/** depth of the water in reach, on a grid of 1 m cells: x −HALF … HALF, z 0 … FAR */
export class PondShape {
  static readonly HALF = 45;
  static readonly FAR = 46;
  readonly w = 2 * PondShape.HALF + 1;
  readonly h = PondShape.FAR + 1;
  readonly depth: Float32Array;

  /** `depthAt(x, z)`: metres of water at a local point (0 or less: dry land) */
  constructor(depthAt: (x: number, z: number) => number) {
    this.depth = new Float32Array(this.w * this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) this.depth[j * this.w + i] = depthAt(i - PondShape.HALF, j);
  }

  /** metres of water at a local point (bilinear between the cells; 0 outside the grid) */
  depthAt(x: number, z: number): number {
    const fx = x + PondShape.HALF;
    const fz = z;
    if (fx < 0 || fz < 0 || fx > this.w - 1 || fz > this.h - 1) return 0;
    const i = Math.min(this.w - 2, Math.floor(fx));
    const j = Math.min(this.h - 2, Math.floor(fz));
    const u = fx - i;
    const v = fz - j;
    const d = this.depth;
    const a = d[j * this.w + i];
    const b = d[j * this.w + i + 1];
    const c = d[(j + 1) * this.w + i];
    const e = d[(j + 1) * this.w + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + e * u * v;
  }

  /** deep enough for a fish to swim (and within the fan one can cast across) */
  swims(x: number, z: number, min = 0.6): boolean {
    if (z < 1) return false;
    const r = Math.hypot(x, z);
    if (r > REACH_MAX + 2) return false;
    if (Math.abs(Math.atan2(x, z)) > FAN + 0.12) return false;
    return this.depthAt(x, z) >= min;
  }

  /** how much of the water in reach is fishable (for the developer's panel) */
  share(): number {
    let n = 0;
    let all = 0;
    for (let z = 1; z <= REACH_MAX; z += 1)
      for (let x = -PondShape.HALF; x <= PondShape.HALF; x += 1) {
        const r = Math.hypot(x, z);
        if (r > REACH_MAX || Math.abs(Math.atan2(x, z)) > FAN) continue;
        all++;
        if (this.depthAt(x, z) >= 0.6) n++;
      }
    return all ? n / all : 0;
  }
}

/** a round lake in front of the jetty (tests, and a world whose water has not been read yet) */
export function roundLake(radius = 60, deep = 5): PondShape {
  const cz = radius - 2;
  return new PondShape((x, z) => {
    const r = Math.hypot(x, z - cz) / radius;
    return r >= 1 ? -1 : deep * (1 - r * r) + 0.3;
  });
}

// ------------------------------------------------------------------ the fish in it

export type FishState = 'roam' | 'come' | 'follow' | 'nibble' | 'bite' | 'hooked' | 'flee';

export interface PondFish {
  /** unique within the water and the day (saved when landed) */
  uid: number;
  /** index into FISH */
  f: number;
  cm: number;
  kg: number;
  /** its weight against its kind's largest */
  q: number;
  /** 0 near, 1 middle, 2 deep */
  zone: number;
  /** where it keeps to, where it is, where it heads, how fast it cruises */
  hx: number;
  hz: number;
  x: number;
  z: number;
  heading: number;
  speed: number;
  tx: number;
  tz: number;
  state: FishState;
  /** seconds in its state; how long it stays shy of baits; how long it is ravenous (the golden ripple) */
  t: number;
  shy: number;
  hungry: number;
  /** nibbles left before it takes the bait, and the time to the next */
  nibbles: number;
  nibT: number;
  /** the moment it has to be struck (s), once it bites */
  window: number;
  /** its strength over the rod's power (set when hooked) and its stamina (s) */
  strength: number;
  pool: number;
  /** a guest of the moment (a boiling shoal's, a celestial fish): gone when the moment is */
  guest?: 'boil' | 'sky';
}

/** how fast each body cruises (m/s) */
const CRUISE: Readonly<Partial<Record<Family, number>>> = { eel: 0.3, catfish: 0.3, ancient: 0.35, turtle: 0.18, crayfish: 0.15, frog: 0.25, flat: 0.25, octopus: 0.2, squid: 0.5, round: 0.25, cube: 0.3, tetra: 0.5, carp: 0.4, disc: 0.4, perch: 0.45, pike: 0.45, fusiform: 0.55 };

/** is the water's lord in it today? (most days; never three days running without) */
export function lordToday(spot: number, day: number): boolean {
  // days before the first are taken as having it; walk the last few
  let a = true;
  let b = true;
  for (let d = Math.max(0, day - 8); d <= day; d++) {
    const here: boolean = d <= 1 || dice(spot * 131 + 7, d, 0x10d) < 0.58 || (!a && !b);
    b = a;
    a = here;
  }
  return a;
}

/** when the shoals boil and the gold rings come: one of each in their own windows of the world's seconds */
export const BOIL = { every: 480, lasts: 45, fish: 6 };
export const GOLDEN = { every: 900, lasts: 90 };

export function boilAt(spot: number, worldT: number): { k: number; t0: number; on: boolean } {
  const k = Math.floor(worldT / BOIL.every);
  const t0 = k * BOIL.every + 60 + dice(spot, k, 0xb011) * (BOIL.every - BOIL.lasts - 90);
  return { k, t0, on: worldT >= t0 && worldT < t0 + BOIL.lasts };
}

export function goldenAt(spot: number, worldT: number): { k: number; t0: number; on: boolean } {
  const k = Math.floor(worldT / GOLDEN.every);
  const t0 = k * GOLDEN.every + 100 + dice(spot, k, 0x601d) * (GOLDEN.every - GOLDEN.lasts - 160);
  return { k, t0, on: worldT >= t0 && worldT < t0 + GOLDEN.lasts };
}

export class Pond {
  readonly spot: number;
  readonly shape: PondShape;
  fish: PondFish[] = [];
  /** the day the stock is of, the uids landed that day, the fish added since the morning */
  day = -1;
  taken = new Set<number>();
  refills = 0;
  private refillT = 0;
  /** the boiling shoal now (null: none): where, and which of the boil windows */
  boil: { x: number; z: number; k: number; until: number } | null = null;
  /** the fish the gold rings are round now (uid), and until when */
  golden: { uid: number; k: number; until: number } | null = null;
  private lastGoldenK = -1;
  /**
   * A water that is none of the ten (docs/V3/plan/fishing.md): any lake or sea one casts into, stocked with the fish of
   * the water of the ten most like it — but its lord and its sky fish keep to their own water. `salt`: a different
   * stock from the ten's own for the same table (a lake down the road is not the first water over again).
   */
  wild = false;
  salt = 0;
  private lastBoilK = -1;
  /** fish brought in near a float since the stock (bringIn): their uids are the day's from 300 on */
  private brought = 0;
  private readonly rng: Stream;
  private readonly kinds: number[];

  constructor(spot: number, shape: PondShape) {
    this.spot = spot;
    this.shape = shape;
    this.kinds = fishOfSpot(spot);
    this.rng = new Stream(spot * 7919 + 13);
  }

  /** the kinds of a rarity that swim here: the common to the epic of every water; the lord and the sky fish of this one */
  kindsOf(tier: number): readonly number[] {
    return tier <= 3 ? fishOfTier(tier) : this.kinds.filter((i) => FISH[i].tier === tier);
  }

  /** which of the water's bands a point is in (0 near, 1 middle, 2 deep), by how far it is from the end of the jetty */
  private zoneAt(x: number, z: number): number {
    const d = Math.hypot(x, z);
    const zs = zonesOf(this.spot);
    return d < zs[0][1] ? 0 : d < zs[1][1] ? 1 : 2;
  }

  private spotSeed(): number {
    return SPOTS[this.spot].seed * 1000 + SPOTS[this.spot].slot + this.salt;
  }

  /** a point of swimmable water in a zone (from a stream), or null when none is found */
  private pointIn(zone: number, r: Stream, shallow = false): { x: number; z: number } | null {
    const [r0, r1] = zonesOf(this.spot)[zone];
    // (a shallow pond — a jetty standing in half a metre of water — has its fish where it is half as deep)
    const min = (zone === 2 ? 1.2 : 0.7) * (shallow ? 0.5 : 1);
    for (let i = 0; i < 40; i++) {
      const rr = r0 + (r1 - r0) * r.next();
      const a = (r.next() * 2 - 1) * FAN;
      const x = Math.sin(a) * rr;
      const z = Math.cos(a) * rr;
      if (this.shape.swims(x, z, min)) return { x, z };
    }
    // (a pond whose deep water is out of reach: the middle, then the near; then the same where it is shallow)
    if (zone > 0) return this.pointIn(zone - 1, r, shallow);
    return shallow ? null : this.pointIn(2, r, true);
  }

  /** a fish of a kind, somewhere in a zone of its rarity's (or the one given; or at the point given) */
  private make(f: number, uid: number, r: Stream, zone?: number, place?: { x: number; z: number }): PondFish | null {
    const def = FISH[f];
    const zs = TIERS[def.tier].zones;
    let z = zone ?? 0;
    if (zone === undefined) {
      const u = r.next();
      z = u < zs[0] ? 0 : u < zs[0] + zs[1] ? 1 : 2;
    }
    const at = place ?? this.pointIn(z, r);
    if (!at) return null;
    const size = rollLength(def, r.next(), r.next());
    return {
      uid,
      f,
      cm: size.cm,
      kg: size.kg,
      q: size.q,
      zone: z,
      hx: at.x,
      hz: at.z,
      x: at.x,
      z: at.z,
      heading: r.next() * Math.PI * 2,
      speed: (CRUISE[def.family] ?? 0.4) * (0.8 + 0.4 * r.next()),
      tx: at.x,
      tz: at.z,
      state: 'roam',
      t: 0,
      shy: 0,
      hungry: 0,
      nibbles: 0,
      nibT: 0,
      window: 0,
      strength: strengthOf(def, size.q),
      pool: staminaOf(def, size.q),
    };
  }

  /** the morning's stock for a day: the same fish every time for the same water and day, less those landed */
  stock(day: number, taken: readonly number[] = [], refills = 0): void {
    this.day = day;
    this.taken = new Set(taken);
    this.refills = 0;
    this.refillT = 0;
    this.fish = [];
    this.boil = null;
    this.golden = null;
    this.brought = 0;
    const cap = SPOTS[this.spot].capacity;
    const r = new Stream(this.spotSeed() * 31 + day * 977);
    // (by the rarities' shares, every one there: the uncommon, the rare and the epic twice at the least, the rest common)
    const n = [0, 1, 2, 3].map((t) => (t === 0 ? 0 : Math.max(2, Math.round(cap * TIERS[t].share))));
    n[0] = cap - n[1] - n[2] - n[3];
    const plan: number[] = [];
    for (let t = 0; t < 4; t++) for (let i = 0; i < n[t]; i++) plan.push(t);
    let uid = day * 1000;
    for (const tier of plan) {
      // (which kind of its rarity by chance, the first waters' kinds the commonest: fish.ts kindWeight)
      const f = pickKind(this.kindsOf(tier), r.next());
      const one = this.make(f, uid++, r);
      if (one && !this.taken.has(one.uid)) this.fish.push(one);
    }
    // the lord, most days (in its own water only)
    if (!this.wild && lordToday(this.spot, day)) {
      const lord = this.kindsOf(4)[0];
      const one = this.make(lord, day * 1000 + 900, r, 2);
      if (one && !this.taken.has(one.uid)) this.fish.push(one);
    }
    for (let i = 0; i < refills; i++) this.refill();
  }

  /** one fish more (the pond fills back while it is below half) */
  refill(): void {
    const r = new Stream(this.spotSeed() * 17 + this.day * 389 + this.refills * 7);
    const u = r.next();
    const tier = u < 0.6 ? 0 : u < 0.9 ? 1 : u < 0.985 ? 2 : 3;
    const one = this.make(pickKind(this.kindsOf(tier), r.next()), this.day * 1000 + 500 + this.refills, r);
    this.refills++;
    if (one && !this.taken.has(one.uid)) this.fish.push(one);
  }

  /**
   * A fish of a rarity brought in near a point (x, z): where a bait of that rarity has been cast with none of its
   * rarity in reach, so no wait is empty (docs/V3/plan/fishing-feel.md §10). The nearest fish of the pond's own that
   * `wants` it (roaming, not shy) is moved there, a few metres off; when none does, one more of that rarity comes, of
   * any water. Null: no water about the point for it to swim in, or no kind of that rarity that would take it now.
   */
  bringIn(tier: number, x: number, z: number, wants: (def: FishDef, q: number) => boolean): PondFish | null {
    if (tier < 0 || tier > 3) return null;
    const r = new Stream(this.spotSeed() * 13 + this.day * 211 + this.brought * 17 + 5);
    let at: { x: number; z: number } | null = null;
    for (let i = 0; i < 24 && !at; i++) {
      const a = r.next() * Math.PI * 2;
      const d = 2.4 + 1.4 * r.next();
      const px = x + Math.sin(a) * d;
      const pz = z + Math.cos(a) * d;
      if (this.shape.swims(px, pz, 0.6)) at = { x: px, z: pz };
    }
    if (!at) return null;
    let one: PondFish | null = null;
    let near = Infinity;
    for (const f of this.fish) {
      const def = FISH[f.f];
      if (f.guest || f.state !== 'roam' || f.shy > 0 || def.tier !== tier || !wants(def, f.q)) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      if (d < near) {
        near = d;
        one = f;
      }
    }
    if (!one) {
      const ks = this.kindsOf(tier).filter((i) => wants(FISH[i], 0.5));
      if (!ks.length) return null;
      // (a uid of the day's not landed yet, nor in the water now)
      let uid = 0;
      for (let k = 0; k < 200; k++) {
        uid = this.day * 1000 + 300 + ((this.brought + k) % 200);
        if (!this.taken.has(uid) && !this.byUid(uid)) break;
      }
      one = this.make(pickKind(ks, r.next()), uid, r, undefined, at);
      if (!one) return null;
      this.fish.push(one);
    }
    this.brought++;
    one.x = one.hx = one.tx = at.x;
    one.z = one.hz = one.tz = at.z;
    one.zone = this.zoneAt(at.x, at.z);
    one.heading = Math.atan2(x - at.x, z - at.z);
    one.t = 0;
    return one;
  }

  /** the fish that are the stock (not the moment's guests), not gone */
  count(): number {
    let n = 0;
    for (const f of this.fish) if (!f.guest) n++;
    return n;
  }

  /** how many of each rarity are in it now, and whether the lord is (the hut's board) */
  census(): { tiers: number[]; lord: boolean; sky: boolean } {
    const tiers = [0, 0, 0, 0, 0, 0];
    let lord = false;
    let sky = false;
    for (const f of this.fish) {
      const t = FISH[f.f].tier;
      if (f.guest === 'boil') continue;
      tiers[t]++;
      if (t === 4) lord = true;
      if (t === 5) sky = true;
    }
    return { tiers, lord, sky };
  }

  byUid(uid: number): PondFish | null {
    for (const f of this.fish) if (f.uid === uid) return f;
    return null;
  }

  /** a fish landed: gone for the day */
  land(uid: number): void {
    const i = this.fish.findIndex((f) => f.uid === uid);
    if (i >= 0) {
      if (!this.fish[i].guest) this.taken.add(uid);
      this.fish.splice(i, 1);
    }
  }

  /** a fish that got away: still in the water, shy for a while, somewhere further off */
  escape(uid: number, shy: number): void {
    const f = this.byUid(uid);
    if (!f) return;
    f.state = 'flee';
    f.t = 0;
    f.shy = shy;
  }

  /**
   * The water's own life for dt seconds: the fish roam, come to a bait, nibble and bite (the session decides who
   * comes); the stock fills back; the moments come and go. `float`: where the bait lies (null: none in the water).
   */
  step(dt: number, worldT: number, day: number, float: { x: number; z: number } | null, sky: { active: boolean }): void {
    if (day !== this.day) this.stock(day);
    // ---- the stock fills back while below half
    const cap = SPOTS[this.spot].capacity;
    this.refillT += dt;
    if (this.refillT > 150) {
      this.refillT = 0;
      if (this.count() < cap / 2) this.refill();
    }
    // ---- the celestial fish comes and goes with its moment
    const skyKind = this.kindsOf(5)[0];
    const skyUid = this.day * 1000 + 950;
    const skyFish = this.fish.find((f) => f.guest === 'sky');
    if (sky.active && !this.wild && !skyFish && !this.taken.has(skyUid)) {
      const one = this.make(skyKind, skyUid, new Stream(skyUid ^ 0x5c1), 1);
      if (one) {
        one.guest = 'sky';
        this.fish.push(one);
      }
    } else if (!sky.active && skyFish && skyFish.state !== 'hooked') this.fish.splice(this.fish.indexOf(skyFish), 1);
    // ---- a shoal boils
    const b = boilAt(this.spot, worldT);
    if (b.on && b.k !== this.lastBoilK) {
      this.lastBoilK = b.k;
      const r = new Stream(this.spotSeed() * 3 + b.k * 101);
      const at = this.pointIn(1, r);
      if (at) {
        this.boil = { x: at.x, z: at.z, k: b.k, until: b.t0 + BOIL.lasts };
        const small = [...this.kindsOf(0), ...this.kindsOf(1)];
        for (let i = 0; i < BOIL.fish; i++) {
          const f = this.make(pickKind(small, r.next()), this.day * 1000 + 700 + (b.k % 50) * 6 + i, r, 1);
          if (!f) continue;
          f.guest = 'boil';
          f.hx = at.x + (r.next() - 0.5) * 3;
          f.hz = at.z + (r.next() - 0.5) * 3;
          f.x = f.hx;
          f.z = f.hz;
          f.hungry = BOIL.lasts;
          this.fish.push(f);
        }
      }
    }
    if (this.boil && worldT >= this.boil.until) {
      this.boil = null;
      this.fish = this.fish.filter((f) => f.guest !== 'boil' || f.state === 'hooked');
    }
    // ---- one rare fish turns ravenous
    const g = goldenAt(this.spot, worldT);
    if (g.on && g.k !== this.lastGoldenK) {
      this.lastGoldenK = g.k;
      const pool = this.fish.filter((f) => !f.guest && FISH[f.f].tier >= 2 && FISH[f.f].tier <= 3);
      const pick = pool.length ? pool[Math.floor(dice(this.spot, g.k, 0x9) * pool.length)] : null;
      if (pick) {
        pick.hungry = GOLDEN.lasts;
        this.golden = { uid: pick.uid, k: g.k, until: g.t0 + GOLDEN.lasts };
      }
    }
    if (this.golden && (worldT >= this.golden.until || !this.byUid(this.golden.uid))) this.golden = null;
    // ---- each fish
    const r = this.rng;
    for (const f of this.fish) {
      f.t += dt;
      if (f.shy > 0) f.shy = Math.max(0, f.shy - dt);
      if (f.hungry > 0) f.hungry = Math.max(0, f.hungry - dt);
      switch (f.state) {
        case 'roam': {
          const d = Math.hypot(f.tx - f.x, f.tz - f.z);
          if (d < 0.6 || f.t > 9) {
            // a new place to idle to, near home
            for (let i = 0; i < 6; i++) {
              const a = r.next() * Math.PI * 2;
              const rr = (f.guest === 'boil' ? 2 : 5) * Math.sqrt(r.next());
              const tx = f.hx + Math.cos(a) * rr;
              const tz = f.hz + Math.sin(a) * rr;
              if (this.shape.swims(tx, tz, 0.5)) {
                f.tx = tx;
                f.tz = tz;
                break;
              }
            }
            f.t = 0;
          }
          this.swimTo(f, f.tx, f.tz, f.speed, dt);
          break;
        }
        case 'come':
          if (!float) {
            f.state = 'roam';
            break;
          }
          this.swimTo(f, float.x, float.z, 0.9, dt);
          if (Math.hypot(float.x - f.x, float.z - f.z) < 0.55) {
            f.state = 'nibble';
            f.t = 0;
            f.nibT = 0.5 + 0.6 * r.next();
          }
          break;
        case 'nibble':
          if (!float) {
            f.state = 'roam';
            break;
          }
          // (it hangs at the bait, turning about it)
          f.heading += dt * 0.6;
          f.x += (float.x - Math.sin(f.heading) * 0.35 - f.x) * Math.min(1, dt * 3);
          f.z += (float.z - Math.cos(f.heading) * 0.35 - f.z) * Math.min(1, dt * 3);
          break;
        case 'bite':
          if (float) {
            f.x += (float.x - f.x) * Math.min(1, dt * 4);
            f.z += (float.z - f.z) * Math.min(1, dt * 4);
          }
          break;
        case 'flee': {
          const fx = float?.x ?? 0;
          const fz = float?.z ?? 0;
          const a = Math.atan2(f.x - fx, f.z - fz);
          this.swimTo(f, f.x + Math.sin(a) * 4, f.z + Math.cos(a) * 4, 1.7, dt);
          if (f.t > 2.5) {
            f.state = 'roam';
            f.t = 9;
          }
          break;
        }
        case 'hooked':
          break;
      }
    }
  }

  private swimTo(f: PondFish, tx: number, tz: number, speed: number, dt: number): void {
    const want = Math.atan2(tx - f.x, tz - f.z);
    let d = want - f.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    f.heading += Math.max(-2 * dt, Math.min(2 * dt, d));
    const nx = f.x + Math.sin(f.heading) * speed * dt;
    const nz = f.z + Math.cos(f.heading) * speed * dt;
    if (this.shape.swims(nx, nz, 0.45)) {
      f.x = nx;
      f.z = nz;
    } else {
      // (the shore: turn back toward home)
      f.heading = Math.atan2(f.hx - f.x, f.hz - f.z);
      f.tx = f.hx;
      f.tz = f.hz;
    }
  }
}

/** a kind's def, for the views */
export function defOf(f: PondFish): FishDef {
  return FISH[f.f];
}
