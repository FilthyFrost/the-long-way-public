/**
 * Anchored landforms of the second world version (docs/V3/nodes/W1-worldgen.md): hills of a designed shape
 * that stand at a place of their own beside the road, in clusters — the towers of karst country, the buttes
 * of red rock, the cinder cones of volcanic land. A cross-section (landform.ts) shapes a whole stretch; these
 * are things one drives past and remembers.
 *
 * A region's recipe says what a cluster is made of; the director (director.ts) says which stretches hold
 * one; the plan lays each cluster out stretch by stretch, in order, each stretch looking only at the road,
 * the water and the stretch before it, so the order in which the world is asked never matters.
 *
 * The rules every landform here keeps (they are what lets the land function stay a height field that
 * wheels, feet and meshes all trust):
 *   - nothing within CLEAR m of the road's centre line beyond the landform's own foot, anywhere along it;
 *   - no slope steeper than two in one (MAX_SLOPE): a height field cannot hold a cliff, nor can its mesh;
 *   - height and slope are continuous, the slope is zero at the foot and on the top;
 *   - arithmetic and hashes only; the land function is never called from here.
 * Overhangs (arches, sea stacks, basalt columns) are not landforms of this kind: they are models with solids.
 *
 * Pure, no three, no DOM.
 */
import { dcos, dsin } from '../math/detmath';
import { hash2 } from '../math/rng';

export type FeatureKind = 'tower' | 'butte' | 'cone';

/** a range [low, high] */
type Span = readonly [number, number];

/** what a cluster of one stretch is made of (a region carries a list of these: RegionDef.features) */
export interface FeatureRecipe {
  readonly kind: FeatureKind;
  /** how many stand in a cluster */
  readonly count: Span;
  /** the radius of one at its foot (m) */
  readonly radius: Span;
  /** its height as a share of its radius (tower up to 1.05, butte up to 0.5, cone up to 0.95: the slope's limit) */
  readonly aspect: Span;
  /** how far from the road's centre line the nearest foot may come, and how far out the cluster reaches (m) */
  readonly near: number;
  readonly far: number;
  /** how long it may be against how wide (1 = round; a butte is often a ridge: up to 2.5) */
  readonly stretch?: Span;
  /** on both sides of the road (default), or on one, chosen by the stretch's hash */
  readonly oneSide?: boolean;
}

/** one landform, as laid out */
export interface LandFeature {
  readonly kind: FeatureKind;
  readonly x: number;
  readonly z: number;
  /** radius at the foot across its narrow way (m), and its length against that */
  readonly r: number;
  readonly stretch: number;
  /** height (m) */
  readonly h: number;
  /** the direction of its long way: cos and sin */
  readonly ca: number;
  readonly sa: number;
  /** the box it lies in */
  readonly xMin: number;
  readonly xMax: number;
  readonly zMin: number;
  readonly zMax: number;
}

/** no landform's foot comes nearer the road's centre line than this (m) */
export const CLEAR = 34;
/** the steepest slope a landform may have (rise over run) */
export const MAX_SLOPE = 2;
/** the largest height-to-radius share each kind may have under MAX_SLOPE (see the profiles' slopes below) */
export const MAX_ASPECT: Readonly<Record<FeatureKind, number>> = { tower: 1.05, butte: 0.5, cone: 0.95 };

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * The shape of each kind: height (as a share of its full height) at `t`, the distance from its middle as a
 * share of its radius (0 the middle, 1 the foot). Each is 0 at the foot with no slope there.
 *
 *   tower  a sugarloaf: a rounded top, steep sides. Steepest slope 1.875 × aspect.
 *   butte  a table: flat over more than half its radius, then a steep side. Steepest slope 3.95 × aspect.
 *   cone   a cinder cone with its crater: a rim at a quarter of the radius, a bowl inside it a third of the
 *          height deep. Steepest slope 2 × aspect.
 */
export function featureProfile(kind: FeatureKind, t: number): number {
  if (t >= 1) return 0;
  if (t < 0) t = 0;
  if (kind === 'tower') return 1 - smooth((t - 0.2) / 0.8);
  if (kind === 'butte') return 1 - smooth((t - 0.62) / 0.38);
  // cone
  const rim = 0.25;
  if (t >= rim) return 1 - smooth((t - rim) / (1 - rim));
  return 1 - 0.33 * (1 - smooth(t / rim));
}

/** the height of one landform above the land it stands on at (x, z); 0 outside it */
export function featureHeight(f: LandFeature, x: number, z: number): number {
  if (x < f.xMin || x > f.xMax || z < f.zMin || z > f.zMax) return 0;
  const dx = x - f.x;
  const dz = z - f.z;
  // along its long way and across it
  const u = (dx * f.ca + dz * f.sa) / f.stretch;
  const v = -dx * f.sa + dz * f.ca;
  const d2 = u * u + v * v;
  if (d2 >= f.r * f.r) return 0;
  return f.h * featureProfile(f.kind, Math.sqrt(d2) / f.r);
}

/** what the plan needs of the road: the point at arc length s (x, z and the heading's cos and sin) */
export interface RoadReader {
  /** fills out with the road's point at s */
  at(s: number, out: { x: number; z: number; cos: number; sin: number }): void;
}

/** metres of road in a stretch, for a plan that is not told (the world tells its plan: its rules' `slot`) */
const SLOT = 1250;
const SALT = 0x0fea;
/** how many places are tried for one landform before the cluster goes without it */
const TRIES = 10;

/** the n-th number in [0, 1) of stretch k (n counts the dice thrown for the stretch, in order) */
function dice(seed: number, k: number, n: number): number {
  return (hash2(k * 4096 + n, SALT, seed | 0) >>> 8) / 16777216;
}

function lerp(span: Span, u: number): number {
  return span[0] + (span[1] - span[0]) * u;
}

/**
 * The anchored landforms along the road. `recipesOf(k)` gives the recipes of stretch k (null or empty: the
 * stretch holds none; the caller decides that from the region and the director); `wet(x, z, s)` says whether
 * water could reach a point, s being the arc length of the road point with the same x (the water plan's
 * bounding boxes: false means certainly dry); `slot` is the length of a stretch (m).
 *
 * Neither of the two is ever to ask the land for a height: the land asks this plan at every point, and a
 * stretch is laid out the first time it does.
 */
export class FeaturePlan {
  private readonly list: (readonly LandFeature[])[] = [];
  private readonly p = { x: 0, z: 0, cos: 1, sin: 0 };
  private readonly seed: number;

  constructor(
    private readonly road: RoadReader,
    seed: number,
    private readonly recipesOf: (k: number) => readonly FeatureRecipe[] | null,
    private readonly wet: (x: number, z: number, s: number) => boolean = () => false,
    private readonly slot: number = SLOT,
  ) {
    this.seed = hash2(seed | 0, 0x0feb, 17);
  }

  /** the landforms of stretch k, laid out as far as asked (stretches before the first hold none) */
  of(k: number): readonly LandFeature[] {
    if (k < 0) return NONE;
    while (this.list.length <= k) this.list.push(this.layout(this.list.length));
    return this.list[k];
  }

  /**
   * The height the anchored landforms add at (x, z), where s is the arc length of the road point with the
   * same x. It reads the stretch s lies in and the one on either side: `layout` sees to it that no landform
   * lies over any other.
   */
  heightAt(x: number, z: number, s: number): number {
    const k = Math.floor(s / this.slot);
    let h = 0;
    for (let i = k - 1; i <= k + 1; i++) {
      if (i < 0) continue;
      const fs = this.of(i);
      for (let j = 0; j < fs.length; j++) {
        const v = featureHeight(fs[j], x, z);
        if (v > h) h = v;
      }
    }
    return h;
  }

  private layout(k: number): readonly LandFeature[] {
    const recipes = this.recipesOf(k);
    if (!recipes || recipes.length === 0) return NONE;
    const SLOT = this.slot;
    const out: LandFeature[] = [];
    const before = k > 0 ? this.list[k - 1] : NONE;
    // the x the road has where the stretch before this one begins and where the one after it ends: a
    // landform of this stretch lies wholly between them (the road's x only ever grows along it), so that
    // `heightAt`, which reads three stretches round the road point of the same x, finds all of it
    this.road.at((k - 1) * SLOT, this.p);
    const xLo = this.p.x;
    this.road.at((k + 2) * SLOT, this.p);
    const xHi = this.p.x;
    let n = 0;
    const next = (): number => dice(this.seed, k, n++);
    for (const r of recipes) {
      const count = Math.round(lerp(r.count, next()));
      // the middle of the cluster along the road, and the side it favours
      const sMid = (k + 0.3 + 0.4 * next()) * SLOT;
      const sideOf = next() < 0.5 ? -1 : 1;
      for (let i = 0; i < count; i++) {
        // (every landform throws the same number of dice whether it finds a place or not: a place refused
        // moves no later landform's dice)
        const base = n;
        n += TRIES * 6;
        for (let t = 0; t < TRIES; t++) {
          const d = (j: number): number => dice(this.seed, k, base + t * 6 + j);
          const radius = lerp(r.radius, d(0));
          const stretch = r.stretch ? lerp(r.stretch, d(1)) : 1;
          const cap = MAX_ASPECT[r.kind];
          const aspect = Math.min(cap, lerp(r.aspect, d(2)));
          const s = sMid + (d(3) - 0.5) * 0.72 * SLOT;
          const side = r.oneSide ? sideOf : d(4) < 0.5 ? -1 : 1;
          // nearer the road more often than far: the ones one remembers are the ones one drives under
          const u = d(5);
          const reach = radius * stretch;
          const lat = r.near + reach + u * u * Math.max(0, r.far - r.near - 2 * reach);
          this.road.at(s, this.p);
          const x = this.p.x - this.p.sin * lat * side;
          const z = this.p.z + this.p.cos * lat * side;
          // its long way lies roughly along the road, turned a little by its own dice
          const turn = (d(1) - 0.5) * 1.2;
          const ct = dcos(turn);
          const st = dsin(turn);
          const ca = this.p.cos * ct - this.p.sin * st;
          const sa = this.p.sin * ct + this.p.cos * st;
          const f: LandFeature = {
            kind: r.kind,
            x,
            z,
            r: radius,
            stretch,
            h: radius * aspect,
            ca,
            sa,
            xMin: x - reach,
            xMax: x + reach,
            zMin: z - reach,
            zMax: z + reach,
          };
          if (f.xMin < xLo || f.xMax >= xHi) continue;
          // (the road point with the same x as its middle: out to one side of a road that runs aslant, a
          // landform lies abreast of a point well along from the one it was measured from)
          const sx = this.stationAtX(x, s);
          if (!this.clearOfRoad(f, sx) || this.inWater(f, sx) || crowds(f, out) || crowds(f, before)) continue;
          out.push(f);
          break;
        }
      }
    }
    return out;
  }

  /** the arc length of the road point that has world x, found from a guess (the road's x only ever grows along it, by more than half a metre a metre) */
  private stationAtX(x: number, s: number): number {
    for (let i = 0; i < 8; i++) {
      this.road.at(s, this.p);
      const dx = x - this.p.x;
      if (dx < 0.5 && dx > -0.5) break;
      s += dx / (this.p.cos > 0.5 ? this.p.cos : 0.5);
    }
    return s;
  }

  /**
   * Is the whole foot at least CLEAR m from the road, along all the road that could pass it? `sx` is the
   * arc length of the road point with the same x as the landform's middle. A road point within `need` of
   * the middle has an x within `need` of it, and the road gains at least 0.55 m of x a metre (its heading
   * stays within 55° of +x): so it lies within need / 0.55 of sx along the road. The road is read every
   * 12 m, and asked for a metre more than CLEAR to cover what lies between two readings.
   */
  private clearOfRoad(f: LandFeature, sx: number): boolean {
    const reach = f.r * f.stretch;
    const need = reach + CLEAR + 1;
    const span = need / 0.55 + 24;
    for (let q = sx - span; q <= sx + span; q += 12) {
      this.road.at(q < 0 ? 0 : q, this.p);
      const dx = this.p.x - f.x;
      const dz = this.p.z - f.z;
      if (dx * dx + dz * dz < need * need) return false;
    }
    return true;
  }

  /** could water reach its middle or its foot? */
  private inWater(f: LandFeature, s: number): boolean {
    const reach = f.r * f.stretch;
    if (this.wet(f.x, f.z, s)) return true;
    return this.wet(f.x - reach, f.z, s) || this.wet(f.x + reach, f.z, s) || this.wet(f.x, f.z - reach, s) || this.wet(f.x, f.z + reach, s);
  }
}

const NONE: readonly LandFeature[] = [];

/** does it stand too much inside one already there? (they may lean on each other: their feet may overlap by a third) */
function crowds(f: LandFeature, others: readonly LandFeature[]): boolean {
  for (const o of others) {
    const dx = o.x - f.x;
    const dz = o.z - f.z;
    const need = 0.67 * (o.r * o.stretch + f.r * f.stretch);
    if (dx * dx + dz * dz < need * need) return true;
  }
  return false;
}
