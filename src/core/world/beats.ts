/**
 * What a journey shows, in order (docs/DESIGN_V2.md 3.3: 旅途导演): every thing along the road that
 * makes somebody in the car say "look" — a change of country, a colossal remain, a place to stop,
 * water to fish in, a bridge, the coast coming in — as a list of beats by arc length.
 *
 * The world is laid out by its own plans (landforms, water, places, landmarks, the sea); this reads
 * them back the way a passenger meets them, so the rhythm the design asks for — something every
 * minute or two, small changes more often, and now and then a few quiet minutes — can be measured,
 * and later steered. Pure: a function of the world.
 */
import { BIOMES } from './biomes';
import { LAND_SLOT } from './landform';
import { LANDMARK_SPACING, Landmark, landmarkAt, landmarkRange } from './landmarks';
import type { Coast } from './sea';
import type { Site } from './sites';
import { BiomeBlend, SpineSample } from './spine';
import type { World } from './terrain';
import type { WaterFeature } from './water';

/** land: the country changes · far: something colossal · place: somewhere to stop · water: a lake, the sea · bridge · small: a wreck, crates */
export type BeatKind = 'land' | 'far' | 'place' | 'water' | 'bridge' | 'small';

export interface Beat {
  /** where along the road it is met (m) */
  s: number;
  kind: BeatKind;
  what: string;
  /** 1 a small change (40 s rule) · 2 a sight · 3 a big one */
  weight: number;
}

const st = new SpineSample();
const bl = new BiomeBlend();
const lm = new Landmark();

/** every beat with sMin ≤ s < sMax, in order */
export function beatsBetween(world: World, sMin: number, sMax: number, out: Beat[] = []): Beat[] {
  out.length = 0;
  const sp = world.spine;
  const plan = sp.plan;
  const k0 = Math.max(0, Math.floor(sMin / LAND_SLOT));
  const k1 = Math.floor(sMax / LAND_SLOT);
  const push = (s: number, kind: BeatKind, what: string, weight: number): void => {
    if (s >= sMin && s < sMax) out.push({ s, kind, what, weight });
  };
  // ---- the country: a new chapter, a new lie of the land, a crest that shows what is beyond it
  for (let c = plan.chapterAt(Math.max(0, sMin)); c <= plan.chapterAt(sMax); c++) if (c > 0) push(plan.starts[c], 'land', `country:${BIOMES[plan.biomeOf(c)].id}`, 3);
  for (let k = Math.max(1, k0); k <= k1; k++) {
    const a = world.land.kindOf(k - 1);
    const b = world.land.kindOf(k);
    if (a !== b && b !== 'open') push(k * LAND_SLOT, 'land', b, 2);
    else if (a === b && b !== 'open' && world.land.sideOf(k) !== world.land.sideOf(k - 1)) push(k * LAND_SLOT, 'land', `${b}:other side`, 1);
  }
  // crests: the road tops out with at least 14 m to come down on both sides within 500 m
  {
    const step = 50;
    const y: number[] = [];
    const a = Math.max(0, Math.floor(sMin / step) - 10);
    const b = Math.ceil(sMax / step) + 10;
    for (let i = a; i <= b; i++) {
      sp.at(i * step, st);
      y.push(st.y);
    }
    let last = -Infinity;
    for (let i = 10; i < y.length - 10; i++) {
      let top = true;
      let before = Infinity;
      let after = Infinity;
      for (let q = 1; q <= 10 && top; q++) {
        if (y[i - q] > y[i] || y[i + q] >= y[i]) top = false;
        if (y[i - q] < before) before = y[i - q];
        if (y[i + q] < after) after = y[i + q];
      }
      const s = (a + i) * step;
      if (top && y[i] - before > 14 && y[i] - after > 14 && s - last > 900) {
        push(s, 'land', 'crest', 2);
        last = s;
      }
    }
  }
  // ---- the sea: the far coast first seen is not a beat by itself; the shore coming in to the road is
  const seas: Coast[] = world.sea.between(sMin - 100, sMax + 100, []);
  for (const c of seas) for (const r of c.runs) push(r.s0 + 350, 'water', 'coast', 3);
  // ---- water by the road, and bridges
  const feats: WaterFeature[] = world.water.between(Math.max(0, sMin - LAND_SLOT), sMax + LAND_SLOT, []);
  for (const f of feats) {
    if (f.kind === 'river') push(f.span0, 'bridge', f.bridge, 2);
    // (world version 5: a river beside the road, where it comes alongside)
    else if (f.kind === 'stream') push(f.s0, 'water', 'river', 2);
    else {
      // a lake counts when its shore is near enough to be seen over the verge
      sp.at(f.s, st);
      const dx = st.x - f.cx;
      const dz = st.z - f.cz;
      const gap = Math.abs(-dx * f.az + dz * f.ax) - f.b;
      if (gap < 80) push(f.s - f.a * 0.6, 'water', f.frozen > 0.5 ? 'ice lake' : 'lake', 2);
      else if (gap < 420) push(f.s - f.a * 0.3, 'water', 'far lake', 1);
    }
  }
  // ---- colossal remains: met where they are nearest (they have been in sight for a while by then)
  const [l0, l1] = landmarkRange(sMin, sMax);
  for (let k = l0; k <= l1 + 1; k++) {
    landmarkAt(world, k, lm);
    if (!lm.absent) push(lm.s, 'far', lm.kind, 3);
  }
  // ---- places, and what lies on the verge
  const sites: Site[] = world.sites.between(sMin - 50, sMax + 50, []);
  for (const site of sites) {
    if (site.kind === 'roadside') {
      const wreck = site.objects.find((o) => o.kind === 'wreck');
      push(site.s, 'small', wreck ? ((wreck.v & 7) === 3 ? 'bus wreck' : 'wreck') : 'crates', wreck && (wreck.v & 7) === 3 ? 2 : 1);
    } else if (site.kind === 'jetty' || site.kind === 'hide') push(site.s, 'water', site.kind, 2);
    else push(site.s, 'place', site.kind, site.kind === 'lighthouse' || site.kind === 'station' ? 3 : 2);
  }
  // where two countries meet the road changes its look gradually; note the middle of it once
  void bl;
  void LANDMARK_SPACING;
  out.sort((p, q) => p.s - q.s);
  return out;
}
