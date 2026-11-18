/**
 * Landforms: what kind of country each stretch of road runs through.
 *
 * The land function hangs the land from the road, which by itself gives a ribbon laid over
 * rolling ground. A landform gives a stretch its cross-section instead — measured from the road,
 * so road and land always fit:
 *
 *   open      level country, as before
 *   hillside  the land climbs on one side and falls away on the other: a view over the valley
 *   valley    the land rises on both sides; the road runs along the floor
 *   ridge     the land falls away on both sides; the road rides the crest
 *   canyon    close, steep walls of layered rock (dry country)
 *
 * Stretches are the water plan's slots, so a lake or a river always gets country that suits it,
 * and they blend into one another over a few hundred metres. Pure and seeded: every player
 * drives the same hills.
 */
import { fbm2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { smoothstep } from '../math/util';
import { BIOMES, regionRow, type RegionDef } from './biomes';
import { BiomeBlend, type RoadSpine } from './spine';

/** metres of road per stretch (the same as a water slot) */
export const LAND_SLOT = 1250;
/** half the length over which one stretch turns into the next (m) */
const BLEND = 210;

export type LandKind = 'open' | 'hillside' | 'valley' | 'ridge' | 'canyon';

export class LandParams {
  /** rise of the land per metre towards the right of the road (negative: it climbs on the left) */
  tilt = 0;
  /** height of the valley sides (m) */
  wall = 0;
  /** how far the land falls away from a ridge road (m) */
  drop = 0;
  /** height of canyon walls (m) */
  canyon = 0;
  /** the big landforms away from the road stand this much taller or lower */
  far = 1;
  /**
   * Worlds of version 2 only (operators.ts; a stretch without them, and every stretch of a world of
   * version 1, has 0): how fully the slopes are cut into benches (0 … 1) and how far apart in height the
   * benches lie (m); how high the dunes stand on open ground (m) and how far it is from crest to crest (m).
   */
  terrace = 0;
  step = 0;
  dune = 0;
  duneLen = 0;

  /**
   * The same, for one side of the road: where the land falls away (the low side of a hillside,
   * both sides of a ridge) the hills of the first kilometre or two stand back, so the view is open.
   * @param lat metres to the right of the road (negative: left)
   */
  farAt(lat: number): number {
    const a = lat < 0 ? -lat : lat;
    const low = this.tilt * lat < 0 ? smoothstep(0, 0.08, this.tilt < 0 ? -this.tilt : this.tilt) : 0;
    const open = Math.max(low, smoothstep(0, 30, this.drop));
    return this.far * (1 - 0.68 * open * (1 - smoothstep(1300, 3200, a)));
  }

  set(o: LandParams): this {
    this.tilt = o.tilt;
    this.wall = o.wall;
    this.drop = o.drop;
    this.canyon = o.canyon;
    this.far = o.far;
    this.terrace = o.terrace;
    this.step = o.step;
    this.dune = o.dune;
    this.duneLen = o.duneLen;
    return this;
  }

  lerp(o: LandParams, t: number): this {
    this.tilt += (o.tilt - this.tilt) * t;
    this.wall += (o.wall - this.wall) * t;
    this.drop += (o.drop - this.drop) * t;
    this.canyon += (o.canyon - this.canyon) * t;
    this.far += (o.far - this.far) * t;
    // Benches and dunes fade out towards country that has none: how fully and how high is mixed like the
    // rest, but the benches' step and the dunes' length stay the side's that has them (benches whose step
    // shrank as they faded would not be level, dunes whose length did would bunch up)
    if (this.terrace > 0 || o.terrace > 0) {
      if (this.terrace <= 0) this.step = o.step;
      else if (o.terrace > 0) this.step += (o.step - this.step) * t;
      this.terrace += (o.terrace - this.terrace) * t;
    }
    if (this.dune > 0 || o.dune > 0) {
      if (this.dune <= 0) this.duneLen = o.duneLen;
      else if (o.dune > 0) this.duneLen += (o.duneLen - this.duneLen) * t;
      this.dune += (o.dune - this.dune) * t;
    }
    return this;
  }
}

interface Stretch {
  kind: LandKind;
  /** which side is high (hillside): +1 right, −1 left */
  side: number;
  p: LandParams;
}

/**
 * Odds of each kind of country, by biome: open, hillside, valley, ridge, canyon. (This table and the next
 * are the developer's dials too: their rows are written into in place, so they stay where they are, and a
 * region is looked up in them afresh every time a stretch is laid out.)
 */
export const LAND_ODDS: Record<string, [number, number, number, number, number]> = {
  plains: [0.26, 0.38, 0.14, 0.22, 0],
  desert: [0.4, 0.14, 0.02, 0.18, 0.26],
  alpine: [0.08, 0.5, 0.24, 0.18, 0],
  // (the second round: a forest keeps to its valleys, the lake country lies open, the maple hills are all slopes)
  forest: [0.2, 0.3, 0.34, 0.16, 0],
  // (where a stretch of the lake country holds no lake, the road is mostly up on a slope or a ridge, looking over the water)
  lakes: [0.22, 0.38, 0.1, 0.3, 0],
  maple: [0.14, 0.44, 0.18, 0.24, 0],
};
const KINDS: LandKind[] = ['open', 'hillside', 'valley', 'ridge', 'canyon'];

/** strength of each kind by biome: [tilt, wall (m), drop (m), canyon (m)] at their fullest */
export const LAND_SIZE: Record<string, [number, number, number, number]> = {
  plains: [0.2, 80, 45, 0],
  desert: [0.14, 70, 40, 85],
  alpine: [0.34, 170, 90, 0],
  forest: [0.22, 110, 50, 0],
  lakes: [0.14, 60, 30, 0],
  maple: [0.26, 110, 60, 0],
};

/** the strength of each kind of country at its fullest, by name: a hillside's rise per metre, the height of a valley's sides, the fall from a ridge, the height of canyon walls (m) */
export interface LandSize {
  tilt: number;
  wall: number;
  drop: number;
  canyon: number;
}

/**
 * The odds of each kind of country in a region, in the order of KINDS: what the region says itself (a
 * kind it leaves out never comes), else the row of LAND_ODDS under its id, else its kin's.
 */
export function landOddsOf(region: RegionDef): readonly number[] {
  const o = region.land?.odds;
  if (o === undefined) return regionRow(LAND_ODDS, region);
  return [o.open ?? 0, o.hillside ?? 0, o.valley ?? 0, o.ridge ?? 0, o.canyon ?? 0];
}

/**
 * The strength of each kind in a region, as LAND_SIZE holds it ([tilt, wall, drop, canyon]): the row
 * under its id, else its kin's, with whatever the region says itself in place of the row's.
 */
export function landSizeOf(region: RegionDef): readonly number[] {
  const row = regionRow(LAND_SIZE, region);
  const s = region.land?.size;
  if (s === undefined) return row;
  return [s.tilt ?? row[0], s.wall ?? row[1], s.drop ?? row[2], s.canyon ?? row[3]];
}

const bl = new BiomeBlend();

export class LandformPlan {
  private readonly list: Stretch[] = [];
  private readonly seed: number;
  private readonly a = new LandParams();
  /** a world of version 2: its regions' terraces and dunes are laid on their stretches (version 1 has neither) */
  private readonly operators: boolean;

  /**
   * @param wet what the water plan's dice put in slot k (decided without any geometry): a river
   *            or a lake by the road wants level country
   */
  constructor(
    private readonly spine: RoadSpine,
    seed: number,
    private readonly wet: (k: number) => 'lake' | 'river' | null,
    /** which side the sea is on in stretch k (+1 right, −1 left), 0 when the road is not on the coast there */
    private readonly coast: (k: number) => number = () => 0,
    /** is stretch k one of the journey's quiet ones? (quiet.ts: the country runs on as it was) */
    private readonly quiet: (k: number) => boolean = () => false,
  ) {
    this.seed = hash2(seed | 0, 0x1a9d, 33);
    this.operators = spine.rules.version >= 2;
  }

  private grow(k: number): void {
    while (this.list.length <= k) {
      const i = this.list.length;
      const h = hash2(i, 0x51e7, this.seed);
      const r = (n: number): number => ((h >>> n) & 0xff) / 255;
      const p = new LandParams();
      let kind: LandKind = 'open';
      let side = h & 0x10000 ? 1 : -1;
      this.spine.biomeAt((i + 0.5) * LAND_SLOT, bl);
      const region = BIOMES[bl.t < 0.5 ? bl.a : bl.b];
      const odds = landOddsOf(region);
      const size = landSizeOf(region);
      const prev = i > 0 ? this.list[i - 1] : null;
      const water = this.wet(i);
      if (i < 1 || water === 'river') kind = 'open';
      else if (prev && this.quiet(i)) {
        // a quiet stretch: the lie of the land does not change
        kind = prev.kind;
        side = prev.side;
      } else if (prev && prev.kind !== 'open' && r(20) < 0.45 && odds[KINDS.indexOf(prev.kind)] > 0) {
        // country runs on: the same hillside for another stretch, on the same side
        kind = prev.kind;
        side = prev.side;
      } else {
        // (odds that have been moved from their sum of one are taken as shares of it)
        const total = odds[0] + odds[1] + odds[2] + odds[3] + odds[4];
        let u = Math.abs(total - 1) > 1e-6 ? r(8) * total : r(8);
        for (let q = 0; q < KINDS.length; q++) {
          if (u < odds[q]) {
            kind = KINDS[q];
            break;
          }
          u -= odds[q];
        }
      }
      // a lake by the road lies in level country or at the foot of a gentle valley, never on a slope
      if (water === 'lake' && (kind === 'hillside' || kind === 'canyon' || kind === 'ridge')) kind = r(4) < 0.7 ? 'open' : 'valley';
      // a coast road: the land climbs on the side away from the sea and falls to the beach on the other
      const sea = this.coast(i);
      if (sea !== 0) {
        kind = 'hillside';
        side = -sea;
      }
      const amt = sea !== 0 ? 0.45 + 0.3 * r(0) : 0.55 + 0.45 * r(0);
      if (kind === 'hillside') {
        p.tilt = side * size[0] * amt;
        p.far = 1.1;
      } else if (kind === 'valley') {
        p.wall = size[1] * amt;
        p.far = 1.15;
      } else if (kind === 'ridge') {
        p.drop = size[2] * amt;
        p.far = 0.8;
      } else if (kind === 'canyon') {
        p.canyon = size[3] * amt;
        p.far = 0.9;
      } else p.far = 0.85 + 0.3 * r(12);
      if (this.operators) {
        // (version 2) terraces on the region's hillsides and valley sides, dunes on its open ground
        const terrace = region.land?.terrace;
        if (terrace && (kind === 'hillside' || kind === 'valley')) {
          p.terrace = terrace.strength;
          p.step = terrace.step;
        }
        const dune = region.land?.dune;
        if (dune && kind === 'open') {
          p.dune = dune.amp;
          p.duneLen = dune.len;
        }
      }
      this.list.push({ kind, side, p });
    }
  }

  /** the kind of country of stretch k */
  kindOf(k: number): LandKind {
    if (k < 0) return 'open';
    this.grow(k);
    return this.list[k].kind;
  }

  /** which side of stretch k is high (hillside): +1 right, −1 left */
  sideOf(k: number): number {
    if (k < 0) return 1;
    this.grow(k);
    return this.list[k].side;
  }

  /** the cross-section in force at arc length s (stretches blended across their borders) */
  at(s: number, out: LandParams): LandParams {
    if (s < 0) s = 0;
    const k = Math.floor(s / LAND_SLOT);
    this.grow(k + 1);
    out.set(this.list[k].p);
    const into = s - k * LAND_SLOT;
    if (into < BLEND && k > 0) out.lerp(this.a.set(this.list[k - 1].p), 0.5 - 0.5 * smoothstep(0, BLEND, into));
    else if (into > LAND_SLOT - BLEND) out.lerp(this.a.set(this.list[k + 1].p), 0.5 * smoothstep(LAND_SLOT - BLEND, LAND_SLOT, into));
    return out;
  }

  /**
   * How much higher or lower than the road's base the land stands, `lat` metres to the right of
   * the road (negative: to the left), under cross-section p. x, z only feed the noise that keeps
   * a canyon's walls from running ruler-straight.
   */
  static offset(p: LandParams, lat: number, x: number, z: number, seed: number): number {
    const a = lat < 0 ? -lat : lat;
    let h = 0;
    if (p.tilt !== 0) {
      // a slope that eases off: 380 m out the hillside has turned into the height above or the valley floor below
      const e = a - 11;
      if (e > 0) {
        const L = 380;
        const q = e / L;
        // the slope starts at `tilt` and flattens: after a few hundred metres the land runs level again
        const run = (L * q) / Math.sqrt(1 + q * q);
        h += (lat < 0 ? -1 : 1) * p.tilt * run;
      }
    }
    if (p.wall > 0) {
      const w = smoothstep(55, 540, a);
      h += p.wall * w * w * (0.85 + 0.15 * w);
    }
    if (p.drop > 0) h -= p.drop * smoothstep(13, 330, a);
    if (p.canyon > 0) {
      // the walls stand closer here and further there, and open into side gullies; steep, but never
      // steeper than two in one (a height field cannot hold a cliff, and nor can its mesh)
      const n = fbm2(x / 170, z / 170, seed + 0x2c1, 2);
      const foot = 13 + 16 * (0.5 + 0.5 * n);
      const face = Math.max(26, p.canyon * 0.95) * (1 + 0.25 * (0.5 - 0.5 * n));
      const gully = smoothstep(0.25, 0.75, fbm2(x / 260 + 7, z / 260, seed + 0x2c2, 1));
      h += p.canyon * smoothstep(foot, foot + face, a) * (1 - 0.5 * gully);
    }
    return h;
  }
}
