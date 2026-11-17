/**
 * The tyres heard on what they roll on (docs/MODCAR.md §23): each surface's own rolling sound and its own slide
 * (foley.ts roll_* and skid_*, synthesized), mixed from the wheels each frame. A roll's pitch and loudness follow
 * its wheel's own speed (a locked wheel's roll goes quiet as its slide takes over); gravel and snow keep
 * crunching at a crawl; with the wheels on two surfaces each is heard as much as its share. Asphalt squeals once
 * a tyre is past its grip; the loose surfaces scatter, spray and rip as soon as a tread slides on them. Heard from
 * inside a closed cab, they come through the floor muffled (stones striking the floor and the arches sharper),
 * clearer with the doors open. The shared road-noise bed (core/audio/mix.ts) is turned down under them.
 */
import { SURFACES } from '../../core/world/ground';
import type { FoleyLoop } from './foley';

/** a wheel as its sound needs it (a VehicleSim's) */
export interface TyreWheel {
  readonly contact: boolean;
  readonly surface: number;
  /** 0 a tyre, 1 a bare rim (it grinds: foley's rim_grind), 2 nothing on the hub */
  readonly fit: number;
  readonly omega: number;
  readonly radius: number;
  readonly vLong: number;
  readonly vLat: number;
  /** slip angle (rad) */
  readonly alpha: number;
}

export interface TyreLoop {
  name: FoleyLoop;
  gain: number;
  rate: number;
  /** the low-pass a closed cab puts on it (Hz); absent, heard as it is */
  cutoff?: number;
}

/**
 * each surface's roll: its loudness against its rate (min(cap, rate^p): gravel and snow crunch at a crawl), the
 * low-pass a closed cab gives it (Hz), and how much of the shared road-noise bed is left under it
 */
const SURF: Record<string, { p: number; cap: number; cabin: number; road: number }> = {
  asphalt: { p: 1.0, cap: 2, cabin: 1200, road: 0.7 },
  gravel: { p: 0.6, cap: 1.8, cabin: 2000, road: 0.45 },
  dirt: { p: 0.8, cap: 1.8, cabin: 1200, road: 0.25 },
  grass: { p: 0.7, cap: 1.8, cabin: 1200, road: 0.15 },
  sand: { p: 0.7, cap: 1.8, cabin: 2000, road: 0.35 },
  snow: { p: 0.6, cap: 1.8, cabin: 2000, road: 0.5 },
  ice: { p: 1.0, cap: 2, cabin: 1200, road: 0.3 },
};
/** the cab's low-pass with every door open (Hz) */
const OPEN_CUTOFF = 8000;

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The tyres' loops this frame and how much of the shared road noise is left (1: all of it).
 * @param o.wet how wet the ground is (0 … 1)
 * @param o.near how near the listener is (1 in the seat … 0 out of earshot)
 * @param o.cabin heard from inside: how open the cab is (0 shut … 1 open); null, from outside
 */
export function tyreLoops(wheels: readonly TyreWheel[], o: { wet: number; near: number; cabin: number | null }): { loops: TyreLoop[]; road: number } {
  const groups = new Map<string, { n: number; rate: number; slide: number; skid2: number }>();
  let n = 0;
  for (const w of wheels) {
    if (!w.contact || w.fit !== 0) continue;
    const name = SURFACES[w.surface]?.name ?? 'asphalt';
    if (!SURF[name]) continue;
    n++;
    let g = groups.get(name);
    if (!g) groups.set(name, (g = { n: 0, rate: 0, slide: 0, skid2: 0 }));
    const tread = w.omega * w.radius;
    g.n++;
    g.rate += (Math.abs(tread) * 3.6) / 50;
    // how fast the tread slides over the ground, and how far past its grip it is (slip ratio and angle together)
    const vs = Math.hypot(tread - w.vLong, w.vLat);
    const s = Math.hypot((tread - w.vLong) / Math.max(1, Math.abs(w.vLong)), Math.tan(Math.min(1.2, Math.abs(w.alpha))));
    const sk = name === 'asphalt' ? smooth(0.1, 0.3, s) * Math.min(1, vs / 2) : name === 'ice' ? 0.9 * Math.min(1, vs / 4) : Math.pow(Math.min(1, Math.max(0, vs - 0.4) / 3), 0.8);
    g.slide = Math.max(g.slide, vs);
    g.skid2 += sk * sk;
  }
  const loops: TyreLoop[] = [];
  if (!n || o.near <= 0) return { loops, road: 1 };
  let road = 0;
  for (const [name, g] of groups) {
    const k = SURF[name];
    const share = g.n / n;
    road += share * k.road;
    const cutoff = o.cabin === null ? undefined : k.cabin * Math.pow(OPEN_CUTOFF / k.cabin, Math.min(1, Math.max(0, o.cabin)));
    const rate = g.rate / g.n;
    if (rate > 0.02) {
      const f = Math.sqrt(share) * o.near;
      loops.push({ name: `roll_${name}` as FoleyLoop, gain: Math.min(k.cap, Math.pow(rate, k.p)) * f, rate, cutoff });
      if (name === 'asphalt' && o.wet > 0.02) loops.push({ name: 'roll_wet', gain: Math.min(2, Math.pow(rate, 1.2)) * Math.min(1, o.wet) * f, rate, cutoff });
    }
    // (the slides as a sum of each tyre's: one wheel spinning is half as loud as four locked)
    const skid = Math.sqrt(g.skid2 / n) * o.near;
    if (skid > 0.01) loops.push({ name: `skid_${name}` as FoleyLoop, gain: skid, rate: Math.min(2, Math.max(0.5, 0.5 + g.slide / 8)), cutoff });
  }
  return { loops, road };
}
