/**
 * (world version 5) The galleries of the emergent Earth's shelf roads and cliff roads (docs/V3/nodes/R7-wrapup.md):
 * where a place's road is given one (RegionDef.galleries and .gallery), a stretch of its shelf runs for a couple of
 * hundred metres under the rock —
 *   rock    a gallery cut into the cliff: its roof the rock, its outer wall a row of pillars between windows onto the
 *           void (the Guoliang road's, the Amalfi coast's)
 *   tunnel  a tunnel through a spur of the mountain, closed, lit by its lamps, a portal of dressed stone at each end
 *   shed    an avalanche shed: a concrete roof on columns, the slope's fill (and its snow) carried over the road
 *
 * Laid out from the spine, the land's plan, the water's and the region alone: nothing here asks the land for a
 * height, so the land may ask it (the places by the road keep clear of a gallery; so does the road's furniture).
 * The scene draws each (scene/galleryBuild.ts); the road's furniture holds its walls as solids.
 */
import { hash2 } from '../math/rng';
import { BIOMES } from './biomes';
import { LAND_SLOT } from './landform';
import { routeOffset } from './routeProfiles';
import { BiomeBlend, SpineSample } from './spine';
import type { World } from './terrain';

export type GalleryKind = 'rock' | 'tunnel' | 'shed';

export interface Gallery {
  /** the stretch it lies in */
  slot: number;
  /** the arc lengths it begins and ends at */
  s0: number;
  s1: number;
  /** the side its rock is on (the shelf's high side): +1 the right, −1 the left */
  side: number;
  kind: GalleryKind;
  seed: number;
}

/** the face of its inner wall, the inner and the outer face of its outer wall (m from the road's centre line) */
export const GALLERY_INNER = 5.3;
export const GALLERY_OUTER = 5.6;
export const GALLERY_OUTER_FACE = 7.4;
/** how high its vault's crown stands over the road's middle, and where the vault springs from its walls (m) */
export const GALLERY_CROWN = 6.2;
export const GALLERY_SPRING = 4.4;
/** how far beyond its ends the road's furniture and its places keep off (m) */
export const GALLERY_MARGIN = 6;

const bl = new BiomeBlend();
const st = new SpineSample();

export class GalleryPlan {
  /** list[k] = the gallery of stretch k (null: none; undefined: not asked yet) */
  private readonly list: (Gallery | null | undefined)[] = [];

  constructor(private readonly world: World) {}

  /** the gallery of stretch k, if it has one */
  at(k: number): Gallery | null {
    if (k < 1 || this.world.rules.version < 5) return null;
    let g = this.list[k];
    if (g === undefined) this.list[k] = g = this.make(k);
    return g;
  }

  /** the galleries that reach into arc lengths sMin … sMax */
  between(sMin: number, sMax: number, out: Gallery[]): Gallery[] {
    out.length = 0;
    if (this.world.rules.version < 5) return out;
    const k0 = Math.max(1, Math.floor(sMin / LAND_SLOT));
    const k1 = Math.floor(sMax / LAND_SLOT);
    for (let k = k0; k <= k1; k++) {
      const g = this.at(k);
      if (g && g.s1 >= sMin && g.s0 <= sMax) out.push(g);
    }
    return out;
  }

  /** the gallery arc length s lies in, or within \`margin\` metres of either of its ends; null if none */
  near(s: number, margin = 0): Gallery | null {
    if (this.world.rules.version < 5) return null;
    const k = Math.floor(s / LAND_SLOT);
    for (const q of [k, k - 1, k + 1]) {
      const g = this.at(q);
      if (g && s >= g.s0 - margin && s <= g.s1 + margin) return g;
    }
    return null;
  }

  private make(k: number): Gallery | null {
    const w = this.world;
    const sp = w.spine;
    sp.biomeAt((k + 0.5) * LAND_SLOT, bl);
    const region = BIOMES[bl.t < 0.5 ? bl.a : bl.b];
    if (!region.galleries || !region.gallery) return null;
    const off = routeOffset(region.id, k);
    if (off === undefined || !region.galleries.includes(off)) return null;
    // (on a shelf, clear of the switchback stacks and of water)
    if (w.land.kindOf(k) !== 'shelf' || sp.pinned(k) || w.water.feature(k)) return null;
    const r = (n: number): number => (hash2(k, n, w.seed + 0x6a1e) & 0xffffff) / 0x1000000;
    const kind = region.gallery;
    const len = kind === 'tunnel' ? 110 + 130 * r(1) : kind === 'shed' ? 140 + 160 * r(1) : 150 + 170 * r(1);
    // within the stretch's own shelf, clear of its blends (210 m either side of its ends), where the road bends least
    const lo = k * LAND_SLOT + 260;
    const hi = (k + 1) * LAND_SLOT - 260 - len;
    if (hi <= lo) return null;
    let best = -1;
    let bestBend = Infinity;
    for (let c = 0; c < 6; c++) {
      const s0 = lo + ((hi - lo) * (c + 0.8 * r(2 + c))) / 6;
      let worst = 0;
      for (let s = s0; s <= s0 + len; s += 10) {
        sp.at(s, st);
        const kk = st.kappa < 0 ? -st.kappa : st.kappa;
        if (kk > worst) worst = kk;
      }
      if (worst < bestBend) {
        bestBend = worst;
        best = s0;
      }
    }
    // (no gallery round a hairpin: its vault would not follow a bend tighter than 38 m)
    if (best < 0 || bestBend > 1 / 38) return null;
    return { slot: k, s0: best, s1: best + len, side: w.land.sideOf(k), kind, seed: hash2(k, 0x6a1f, w.seed) };
  }
}
