/**
 * Water: lakes beside the road and rivers that cross it under a bridge.
 *
 * Like the landmarks, water is placed in slots along the road by hashing the seed, so every
 * player sees the same lakes. Each feature is a small recipe that reshapes the land function:
 *
 *   lake    a bowl sunk into the land beside the road; its level hangs from the lowest point of
 *           the road anywhere near, so the road always looks down on the water
 *   river   a channel that runs across the world's x axis (the road runs along it), square to
 *           the road where it passes under the bridge and winding further out. Its surface lies
 *           a fixed depth below the road's elevation at the same x — exactly as the land's base
 *           does — so the channel is always cut into the land, the banks open into a valley
 *           where hills stand in the way, and two rivers that meet do so at the same level.
 *
 * Slots are filled in order, each looking only at the ones before it (a lake gives way to a
 * river already there, a river looks for a crossing clear of the lakes): same seed, same water,
 * whoever asks first. Nothing here asks the terrain for a height: the recipes need only the road.
 */
import { dcos, dsin } from '../math/detmath';
import { fbm2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES, regionRow, type RegionDef, type RegionWater } from './biomes';
import { BiomeBlend, SpineSample, type RoadSpine } from './spine';

/** metres of road per water slot (a slot holds one feature at most) */
export const WATER_SLOT = 1250;
/** half width of a bridge deck (m): the pavement, the shoulders and a kerb's worth more */
export const DECK_HALF = 5.6;
/** the kerb starts here (m from the centre line) */
export const KERB_AT = 5.25;
export const KERB_HEIGHT = 0.22;
/** length over which a bridge's end blends into the embankment (m) */
const SPAN_FEATHER = 5;
/** how many slots either side of a point's own may hold water that reaches it */
const REACH_SLOTS = 3;
/** slope of a river's banks above the gravel bar */
const BANK = 0.62;
/** a lake reshapes the land out to this many times its own size: the basin it lies in */
const BASIN = 1.72;

export type BridgeKind = 'arch' | 'beam' | 'truss';

export interface Lake {
  kind: 'lake';
  slot: number;
  /** arc length of the road point the lake lies beside */
  s: number;
  /** centre, and the unit vector of its long axis (the road heading there) */
  cx: number;
  cz: number;
  ax: number;
  az: number;
  /** half length along the road, half width across (m) */
  a: number;
  b: number;
  level: number;
  /** water depth in the middle (m) */
  depth: number;
  /** 0 open water … 1 frozen over */
  frozen: number;
  /** which side of the road: +1 right, −1 left */
  side: number;
  seed: number;
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
}

export interface River {
  kind: 'river';
  slot: number;
  /** arc length where it passes under the road, and that point */
  s: number;
  x0: number;
  z0: number;
  /** dx/dz of the river where it passes under the road (square to the road, give or take a skew) */
  slope0: number;
  /** distance over which it turns to run straight across the x axis (m) */
  relax: number;
  /** half width of the water (m) and depth of the channel */
  w0: number;
  depth: number;
  /** meander: amplitude (m), wavelength (m), phase */
  amp: number;
  lambda: number;
  phase: number;
  /** the river runs this far in z to either side of the road (m) */
  zEnd: number;
  /** water level under the bridge, and how far that is below the road */
  level0: number;
  clear: number;
  /** the bridge: arc-length range of the span and its type */
  span0: number;
  span1: number;
  bridge: BridgeKind;
  frozen: number;
  seed: number;
  xMin: number;
  xMax: number;
}

export type WaterFeature = Lake | River;

/** what the water does to one point of the land */
export class WaterEffect {
  /** water level standing over (or lapping beside) this point; −Infinity where there is none */
  level = -Infinity;
  /** 0 open water … 1 ice */
  frozen = 0;
  /** 1 lake, 2 river, 0 none */
  kind = 0;
  /** rivers: distance along the river from the bridge (m, in z) and how far outside the water's edge (m, negative inside) */
  t = 0;
  l = 0;
}

const st = new SpineSample();
const bl = new BiomeBlend();

/**
 * By biome: how often a slot holds a lake / a river (0…1), whether water freezes, and how far
 * below the land's base a river runs (deeper where the land rolls more, so the banks hold it).
 * See docs/DESIGN_V2.md §4.5.
 */
const WATER: Record<string, RegionWater> = {
  plains: { lake: 0.52, river: 0.24, frozen: 0, clear: 6.5 },
  desert: { lake: 0.1, river: 0, frozen: 0, clear: 5 },
  alpine: { lake: 0.28, river: 0.2, frozen: 1, clear: 8 },
  forest: { lake: 0.3, river: 0.34, frozen: 0, clear: 7 },
  // (lake country: three stretches in four hold a lake)
  lakes: { lake: 0.66, river: 0.12, frozen: 0, clear: 5 },
  maple: { lake: 0.3, river: 0.3, frozen: 0, clear: 7 },
};

/** a region's water: what it says itself, else the row under its id, else its kin's */
export function waterOf(region: RegionDef): RegionWater {
  return region.water ?? regionRow(WATER, region);
}

/** where a river's centre line is at z − z0 = zr: x and dx/dz */
const rc = { x: 0, dx: 0 };
/** one river reaching a point: what carve() needs to cut its channel */
interface RiverHit {
  f: River;
  zr: number;
  dist: number;
  w: number;
  level: number;
}
const hits: RiverHit[] = [0, 1, 2, 3].map(() => ({ f: null as unknown as River, zr: 0, dist: 0, w: 0, level: 0 }));
const lakeHits: { f: Lake; rho: number }[] = [0, 1, 2].map(() => ({ f: null as unknown as Lake, rho: 0 }));

export class WaterPlan {
  /** list[k] = the feature of slot k (null: dry); filled in order */
  private readonly list: (WaterFeature | null)[] = [null];
  private readonly seed: number;

  /**
   * @param dry what a stretch must not hold whatever the dice say: 0 nothing forbidden, 1 no river
   *            (a sea lies along that chapter: a river would have to end in it, at its level), 2 no
   *            river and no lake (the road runs along the shore there: a lake beside the sea would
   *            have to share its level)
   */
  constructor(
    private readonly spine: RoadSpine,
    seed: number,
    private readonly dry: (k: number) => number = () => 0,
  ) {
    this.seed = hash2(seed | 0, 0x7a7e, 91);
  }

  private biomeWater(s: number): RegionWater {
    this.spine.biomeAt(s, bl);
    return waterOf(BIOMES[bl.t < 0.5 ? bl.a : bl.b]);
  }

  /** what the dice put in slot k, before any geometry (it may still fail to fit) */
  diceOf(k: number): 'lake' | 'river' | null {
    const dry = k < 1 ? 2 : this.dry(k);
    if (dry >= 2) return null;
    const h = hash2(k, 0x3a7e, this.seed);
    const c = this.biomeWater((k + 0.5) * WATER_SLOT);
    const r = (h & 0xffff) / 65536;
    if (r < c.river) return dry === 1 ? null : 'river';
    if (r < c.river + c.lake) return 'lake';
    return null;
  }

  /** The feature of slot k (null if the slot is dry). */
  feature(k: number): WaterFeature | null {
    if (k < 1) return null;
    const list = this.list;
    while (list.length <= k) {
      const i = list.length;
      const kind = this.diceOf(i);
      // (pushed before it is built, so a builder asking about slot i itself gets "nothing yet")
      list.push(null);
      list[i] = kind === 'lake' ? this.makeLake(i) : kind === 'river' ? this.makeRiver(i) : null;
    }
    return list[k];
  }

  /** how far below the road a river's surface lies at arc length s (blended across biome borders) */
  private clearAt(s: number): number {
    this.spine.biomeAt(s, bl);
    const a = waterOf(BIOMES[bl.a]).clear;
    if (bl.t <= 0) return a;
    return a + (waterOf(BIOMES[bl.b]).clear - a) * bl.t;
  }

  private frozenAt(s: number): number {
    this.spine.biomeAt(s, bl);
    const fa = waterOf(BIOMES[bl.a]).frozen;
    const fb = waterOf(BIOMES[bl.b]).frozen;
    return fa + (fb - fa) * bl.t;
  }

  /** a lake's shore measure without its bays: < 1 inside the bowl */
  private static rhoPlain(f: Lake, x: number, z: number): number {
    const dx = x - f.cx;
    const dz = z - f.cz;
    const u = dx * f.ax + dz * f.az;
    const v = -dx * f.az + dz * f.ax;
    return Math.sqrt((u * u) / (f.a * f.a) + (v * v) / (f.b * f.b));
  }

  /** do two lakes' bowls (with the ground they reshape around them) touch? */
  private static lakesTouch(p: Lake, q: Lake): boolean {
    for (let i = 0; i < 40; i++) {
      const an = (i / 40) * 6.2832;
      const c = Math.cos(an) * 1.32;
      const s = Math.sin(an) * 1.32;
      if (WaterPlan.rhoPlain(q, p.cx + c * p.a * p.ax - s * p.b * p.az, p.cz + c * p.a * p.az + s * p.b * p.ax) < 1.36) return true;
      if (WaterPlan.rhoPlain(p, q.cx + c * q.a * q.ax - s * q.b * q.az, q.cz + c * q.a * q.az + s * q.b * q.ax) < 1.36) return true;
    }
    return false;
  }

  /** does a river run through (or right beside) a lake's bowl? */
  private static riverMeetsLake(r: River, l: Lake): boolean {
    if (r.xMax < l.xMin || r.xMin > l.xMax) return false;
    const z0 = Math.max(l.zMin - 40, r.z0 - r.zEnd);
    const z1 = Math.min(l.zMax + 40, r.z0 + r.zEnd);
    const margin = BASIN + 0.03 + (r.w0 * 1.25 + 30) / Math.min(l.a, l.b);
    for (let z = z0; z <= z1; z += 16) {
      WaterPlan.riverCentre(r, z - r.z0, rc);
      if (WaterPlan.rhoPlain(l, rc.x, z) < margin) return true;
    }
    return false;
  }

  private makeLake(k: number): Lake | null {
    const sp = this.spine;
    const r = (n: number): number => (hash2(k, n, this.seed + 0x1a4e) & 0xffffff) / 0x1000000;
    const side = r(1) < 0.5 ? -1 : 1;
    // one lake in four lies well back from the road and is large
    const far = r(2) < 0.25;
    // (no longer than its own stretch of country: the next one may be a hillside, and a lake does not lie on a slope)
    let a = far ? 260 + 105 * r(3) : 110 + 255 * r(3) * r(3);
    let b = far ? 190 + 130 * r(4) : Math.min(a * (0.5 + 0.4 * r(4)), 250);
    // (close enough, and far enough below the road, to be seen over the meadow from the driver's seat)
    const gap0 = far ? 190 + 330 * r(5) : 15 + 26 * r(5);
    const drop = far ? 4 + 9 * r(7) : 2.6 + 4 * r(7);
    const depth = 2.5 + 5.5 * r(8);
    // if it will not fit among its neighbours as drawn, a smaller lake may
    for (let shrink = 0; shrink < 3; shrink++, a *= 0.68, b *= 0.68) {
      // lakes lie where the land is level: of five places in the slot, take the one where the road
      // rises and falls least over the lake's length
      let s = 0;
      let flattest = Infinity;
      const room = Math.max(0, WATER_SLOT / 2 - 150 - a * 1.3);
      for (let c = 0; c < 5; c++) {
        const sc = (k + 0.5) * WATER_SLOT + room * ((c - 2) / 2) * (0.75 + 0.25 * r(6));
        let lo = Infinity;
        let hi = -Infinity;
        for (let q = sc - a - 40; q <= sc + a + 40; q += 16) {
          sp.at(q, st);
          if (st.y < lo) lo = st.y;
          if (st.y > hi) hi = st.y;
        }
        if (hi - lo < flattest) {
          flattest = hi - lo;
          s = sc;
        }
      }
      sp.at(s, st);
      const ax = dcos(st.phi);
      const az = dsin(st.phi);
      const px = st.x;
      const pz = st.z;
      // The road may curve towards the water, further along or further back: walk it well past both
      // ends of the lake. Every road point must keep its distance (16 m outside the bowl), or the
      // lake is pushed out; and the level hangs from the lowest road point anywhere near the bowl,
      // so the road always looks down on the water.
      let gap = gap0;
      let cx = 0;
      let cz = 0;
      let low = Infinity;
      let ok = false;
      const reach = 2 * a + 500;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        const d0 = side * (gap + b);
        cx = px - az * d0;
        cz = pz + ax * d0;
        ok = true;
        low = Infinity;
        let worst = 0;
        for (let q = Math.max(0, s - reach); q <= s + reach; q += 12) {
          sp.at(q, st);
          const u = (st.x - cx) * ax + (st.z - cz) * az;
          const v = -(st.x - cx) * az + (st.z - cz) * ax;
          const rho = Math.sqrt((u * u) / (a * a) + (v * v) / (b * b));
          const need = 1 + 16 / b;
          if (rho < need) {
            ok = false;
            const short = (need - rho) * b;
            if (short > worst) worst = short;
          }
          if (rho < 1.5 && st.y < low) low = st.y;
        }
        if (!ok) gap += worst + 6;
      }
      if (!ok || low === Infinity) continue;
      const ext = Math.hypot(a * ax, b * az) * BASIN + 8;
      const extZ = Math.hypot(a * az, b * ax) * BASIN + 8;
      const lake: Lake = { kind: 'lake', slot: k, s, cx, cz, ax, az, a, b, level: low - drop, depth, frozen: this.frozenAt(s), side, seed: hash2(k, 0x1a5e, this.seed), xMin: cx - ext, xMax: cx + ext, zMin: cz - extZ, zMax: cz + extZ };
      // it must not run into the water already there
      let clash = false;
      for (let j = Math.max(1, k - REACH_SLOTS); j < k && !clash; j++) {
        const o = this.list[j];
        if (!o) continue;
        clash = o.kind === 'lake' ? WaterPlan.lakesTouch(lake, o) : WaterPlan.riverMeetsLake(o, lake);
      }
      if (!clash) return lake;
    }
    return null;
  }

  private makeRiver(k: number): River | null {
    const sp = this.spine;
    const r = (n: number): number => (hash2(k, n, this.seed + 0x21fe) & 0xffffff) / 0x1000000;
    // cross where the road is low and nearly straight: every candidate station, best first
    const cand: { s: number; cost: number }[] = [];
    // (in the middle of its stretch, which is level country: the river must not stray onto the next one's slopes)
    for (let q = (k + 0.38) * WATER_SLOT; q <= (k + 0.62) * WATER_SLOT; q += 8) {
      sp.at(q, st);
      const bend = st.kappa < 0 ? -st.kappa : st.kappa;
      if (bend > 0.0035) continue;
      cand.push({ s: q, cost: st.y + bend * 2500 + (st.grade < 0 ? -st.grade : st.grade) * 60 });
    }
    cand.sort((p, q) => p.cost - q.cost || p.s - q.s);
    const skew = (r(1) - 0.5) * 0.42;
    const w0 = 9 + 23 * r(2) * r(2);
    const zEnd = 2400 + 1000 * r(4);
    const amp = 22 + 23 * r(5);
    let tried = 0;
    for (const c of cand) {
      // (a crossing next to one that failed fails too: step along the list)
      if (tried++ % 6 !== 0) continue;
      const s = c.s;
      sp.at(s, st);
      const clear = this.clearAt(s);
      // the river leaves the road square to it (give or take the skew): dx/dz of that direction
      const ang = st.phi + skew;
      let slope0 = -dsin(ang) / dcos(ang);
      slope0 = slope0 < -0.7 ? -0.7 : slope0 > 0.7 ? 0.7 : slope0;
      const relax = 180 + 80 * r(9);
      // (where the clamp bites, the river passes under the road at a slant: the span grows with it)
      const cross = Math.atan(slope0) + st.phi;
      const half = (w0 + clear / 0.75 + 2) / Math.max(0.55, Math.cos(cross));
      const span = 2 * half;
      const reachX = Math.abs(slope0) * relax + 1.45 * amp + w0 * 1.25 + 430;
      const river: River = {
        kind: 'river',
        slot: k,
        s,
        x0: st.x,
        z0: st.z,
        slope0,
        relax,
        w0,
        depth: 1.2 + 1.8 * r(6),
        amp,
        lambda: 350 + 350 * r(7),
        phase: r(8) * 6.2832,
        zEnd,
        level0: st.y - clear,
        clear,
        span0: s - half,
        span1: s + half,
        // stone arches wherever the river is small enough for them; steel only over the widest
        bridge: span < 50 ? 'arch' : span < 72 ? 'beam' : 'truss',
        frozen: this.frozenAt(s),
        seed: hash2(k, 0x21ff, this.seed),
        xMin: st.x - reachX,
        xMax: st.x + reachX,
      };
      let clash = false;
      for (let j = Math.max(1, k - REACH_SLOTS); j < k && !clash; j++) {
        const o = this.list[j];
        if (o && o.kind === 'lake') clash = WaterPlan.riverMeetsLake(river, o);
      }
      if (!clash) return river;
    }
    return null;
  }

  /** the river (if any) whose bridge carries the road at arc length s, and how fully (0…1) */
  bridgeAt(s: number, out: { river: River | null; mask: number }): void {
    out.river = null;
    out.mask = 0;
    if (s < WATER_SLOT) return;
    const f = this.feature(Math.floor(s / WATER_SLOT));
    if (!f || f.kind !== 'river') return;
    const m = smoothstep(f.span0 - SPAN_FEATHER, f.span0, s) * (1 - smoothstep(f.span1, f.span1 + SPAN_FEATHER, s));
    if (m > 0) {
      out.river = f;
      out.mask = m;
    }
  }

  /** where a river's centre line is at zr = z − z0: its x, and dx/dz there */
  static riverCentre(f: River, zr: number, out: { x: number; dx: number }): void {
    const at = zr < 0 ? -zr : zr;
    // it leaves the bridge at slope0 and turns to run straight across; the turn is done after a few `relax`
    const q = at / f.relax;
    const turn = (f.slope0 * f.relax * q) / (1 + q);
    const dturn = f.slope0 / ((1 + q) * (1 + q));
    // straight under the bridge, winding further out
    const e = smoothstep(18, 150, at);
    const k = 6.2832 / f.lambda;
    const a1 = k * zr + f.phase;
    const a2 = k * 0.43 * zr + f.phase * 1.7;
    // (the envelope's own slope is small next to the wave's; left out)
    out.x = f.x0 + (zr < 0 ? -turn : turn) + f.amp * e * (Math.sin(a1) + 0.45 * Math.sin(a2));
    out.dx = dturn + f.amp * e * k * (Math.cos(a1) + 0.45 * 0.43 * Math.cos(a2));
  }

  /** half width of a river's water at zr = z − z0 (0 beyond its ends) */
  static riverHalfWidth(f: River, zr: number): number {
    const at = zr < 0 ? -zr : zr;
    if (at >= f.zEnd) return 0;
    return f.w0 * (1 + 0.22 * Math.sin(zr / 97 + f.phase * 2.3)) * (1 - smoothstep(f.zEnd - 700, f.zEnd, at));
  }

  /** water level of any river where its centre line has world x: a fixed depth below the road's elevation at that x */
  riverLevel(x: number): number {
    const sp = this.spine;
    const s = sp.sAtX(x);
    sp.at(s, st);
    const y = st.y;
    return y - this.clearAt(s < 0 ? 0 : s);
  }

  /** shoreline measure of a lake: < 0.894 is water, 1 is the edge of its bowl */
  static lakeRho(f: Lake, x: number, z: number): number {
    const rho = WaterPlan.rhoPlain(f, x, z);
    if (rho > 1.6) return rho;
    // bays: the noise only ever draws the shore in, never out towards the road (and dies away outside the bowl)
    const scale = Math.min(f.a, f.b) * 0.55 + 30;
    const n = 0.5 + 0.5 * fbm2(x / scale, z / scale, f.seed, 2);
    // (a bay is tens of metres deep whatever the size of the lake)
    const amp = Math.min(0.34, 30 / Math.min(f.a, f.b));
    return rho * (1 + amp * n * (1 - smoothstep(1.05, 1.6, rho)));
  }

  /**
   * Reshape the land at (x, z): returns the new land height and fills `out` with the water there.
   * @param s0 arc length of the road point with the same x (the terrain has it at hand)
   * @param T  the land as it would be without water
   */
  carve(x: number, z: number, s0: number, T: number, out: WaterEffect): number {
    out.level = -Infinity;
    out.kind = 0;
    out.frozen = 0;
    if (s0 < WATER_SLOT * 0.4) return T;
    const k0 = Math.floor(s0 / WATER_SLOT);
    let h = T;
    let nr = 0;
    let nl = 0;
    for (let k = k0 - REACH_SLOTS; k <= k0 + REACH_SLOTS; k++) {
      const f = this.feature(k);
      if (!f || x < f.xMin || x > f.xMax) continue;
      if (f.kind === 'lake') {
        if (z < f.zMin || z > f.zMax || nl >= lakeHits.length) continue;
        const rho = WaterPlan.lakeRho(f, x, z);
        if (rho >= BASIN) continue;
        lakeHits[nl].f = f;
        lakeHits[nl++].rho = rho;
        // a lake lies in a basin: the land around falls gently to the shore, so the water shows from the road
        if (rho > 0.9) {
          const rise = f.level + 0.35 + (rho - 0.95) * Math.min(f.a, f.b) * 0.075;
          if (h > rise) h += (rise - h) * (1 - smoothstep(1.38, BASIN, rho));
        }
      } else if (nr < hits.length) {
        const zr = z - f.z0;
        const at = zr < 0 ? -zr : zr;
        if (at >= f.zEnd) continue;
        WaterPlan.riverCentre(f, zr, rc);
        const lat = x - rc.x;
        const dist = (lat < 0 ? -lat : lat) / Math.sqrt(1 + rc.dx * rc.dx);
        const w = WaterPlan.riverHalfWidth(f, zr);
        // the valley a river cuts is never wider than this: beyond it the land is untouched
        if (dist > w + 420) continue;
        const hit = hits[nr++];
        hit.f = f;
        hit.zr = zr;
        hit.dist = dist;
        hit.w = w;
        hit.level = this.riverLevel(rc.x);
      }
    }
    // rivers next: their valleys are cut before the lakes set their rims, so no valley drains a lake
    for (let i = 0; i < nr; i++) {
      const hit = hits[i];
      const f = hit.f;
      const at = hit.zr < 0 ? -hit.zr : hit.zr;
      const fade = 1 - smoothstep(f.zEnd - 500, f.zEnd - 60, at);
      const { dist, w, level } = hit;
      let hc: number;
      if (dist < w) {
        const q = dist / w;
        hc = level - f.depth * (1 - q * q);
        // (where another river's deeper channel runs through, that one stays)
        if (h < hc) hc = h;
      } else {
        // a gravel bar at the water's edge, then the bank, steepening so that no hill is too high to be cut through
        const e = dist - w;
        const far = e > 150 ? e - 150 : 0;
        const line = level + (e < 3 ? e * 0.18 : 0.54 + (e - 3) * BANK) + far * far * 0.02;
        hc = h < line ? h : line;
        if (e < 9) {
          // a low levee where the land would have let the river out — but never a dam across another river
          let free = true;
          for (let j = 0; j < nr && free; j++) if (j !== i && hits[j].dist < hits[j].w + 4) free = false;
          const lev = level + Math.min(0.35, e * 0.12);
          if (free && hc < lev) hc = lev;
        }
      }
      h += (hc - h) * fade;
      if (dist < w + 14 && fade > 0.02 && (out.kind !== 2 || dist - w < out.l)) {
        out.level = level;
        out.kind = 2;
        out.frozen = f.frozen;
        out.t = hit.zr;
        // (for two rivers at once, the nearer one's water counts)
        out.l = dist - w;
      }
    }
    // the lakes themselves last: the bowl, and a low rim that keeps the water in whatever was done around it
    for (let i = 0; i < nl; i++) {
      const f = lakeHits[i].f;
      const rho = lakeHits[i].rho;
      if (rho < 1.3) {
        const bowl = f.level + f.depth * (rho * rho - 0.8) * 1.25;
        h += (bowl - h) * (1 - smoothstep(0.93, 1.3, rho));
      }
      if (rho > 0.9) {
        // (outside the shore the rim falls away as a bank, so that where the lake lies above the land
        // around it is held by a dam with a slope, not by a wall)
        const outside = (rho - 1.12) * Math.min(f.a, f.b);
        const rim = f.level + 0.3 * smoothstep(0.9, 1.0, rho) - (outside > 0 ? outside * 0.7 : 0);
        if (h < rim) h = rim;
      }
      if (rho < 1.12) {
        // in the water, or on the beach: the painter wants to know how far above the level this ground is
        out.level = f.level;
        out.kind = 1;
        out.frozen = f.frozen;
      }
    }
    return h;
  }

  /** Could any water reach (x, z)? Bounding boxes only: cheap, and false means certainly dry. */
  mayReach(x: number, z: number, s0: number): boolean {
    if (s0 < WATER_SLOT * 0.4) return false;
    const k0 = Math.floor(s0 / WATER_SLOT);
    for (let k = k0 - REACH_SLOTS; k <= k0 + REACH_SLOTS; k++) {
      const f = this.feature(k);
      if (!f || x < f.xMin || x > f.xMax) continue;
      if (f.kind === 'river' || (z >= f.zMin && z <= f.zMax)) return true;
    }
    return false;
  }

  /**
   * Does anything round within `r` m of (x, z) touch water or the ground water has shaped: the box a lake's
   * basin lies in, or a river's water and `shore` m of its banks? Exact for rivers (their centre line is
   * walked across the whole round), where `mayReach` answers for the whole strip of country a river runs
   * through. For what is to stand beside water and not in it (the anchored landforms of a world of
   * version 2); like everything here it needs only the road.
   * @param s0 arc length of the road point with the same x
   */
  touches(x: number, z: number, s0: number, r: number, shore: number): boolean {
    if (s0 < WATER_SLOT * 0.4) return false;
    const k0 = Math.floor(s0 / WATER_SLOT);
    for (let k = k0 - REACH_SLOTS; k <= k0 + REACH_SLOTS; k++) {
      const f = this.feature(k);
      if (!f || x + r < f.xMin || x - r > f.xMax) continue;
      if (f.kind === 'lake') {
        if (z + r >= f.zMin && z - r <= f.zMax) return true;
        continue;
      }
      // the river's centre line every few metres of z across the round, and a little beyond for its width
      const reach = r + shore + f.w0 * 1.25;
      for (let zz = z - reach; zz <= z + reach; zz += 12) {
        const zr = zz - f.z0;
        if (zr >= f.zEnd || zr <= -f.zEnd) continue;
        WaterPlan.riverCentre(f, zr, rc);
        const dx = rc.x - x;
        const dz = zz - z;
        const need = r + shore + WaterPlan.riverHalfWidth(f, zr);
        if (dx * dx + dz * dz < need * need) return true;
      }
    }
    return false;
  }

  /** features whose slots lie within [sMin, sMax] of road (for building their meshes) */
  between(sMin: number, sMax: number, out: WaterFeature[]): WaterFeature[] {
    out.length = 0;
    const k0 = Math.max(1, Math.floor(sMin / WATER_SLOT));
    const k1 = Math.floor(sMax / WATER_SLOT);
    for (let k = k0; k <= k1; k++) {
      const f = this.feature(k);
      if (f) out.push(f);
    }
    return out;
  }
}
