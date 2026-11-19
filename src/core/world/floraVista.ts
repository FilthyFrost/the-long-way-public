import { dcos, dsin } from '../math/detmath';
import { smoothstep } from '../math/util';
import { openness } from './relief';
import { SpineSample } from './spine';
import { BIOMES } from './biomes';
import type { TerrainPoint, World } from './terrain';

// A seated driver's sightline obliquely across each verge. Keep a wood unless there is a
// subject behind it: an exposed lake, a falling valley floor or a ridge above the near skyline.
const STEP = 80;
const RANGES = [40, 100, 240, 600, 1600, 3200];
export class FloraVistas {
  private readonly cache = new Map<number, number>();
  private readonly road = new SpineSample();

  constructor(private readonly world: World, private readonly ground: TerrainPoint) {}

  private station(index: number, side: number): number {
    const key = index * 2 + (side > 0 ? 1 : 0);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const sp = this.road;
    this.world.spine.at(index * STEP, sp);
    const az = sp.phi + side * 1.1;
    const dx = dcos(az);
    const dz = dsin(az);
    let horizon = -Infinity;
    let opening = 0;
    let nearHorizon = -Infinity;
    for (const d of RANGES) {
      const p = this.ground;
      this.world.shape(sp.x + dx * d, sp.z + dz * d, p);
      const h = Math.max(p.bed, p.wl) - sp.y - 1.6;
      const slope = h / d;
      if (p.wkind === 1 && p.wl > p.bed && slope > horizon - 0.015) opening = 1;
      if (d <= 240) nearHorizon = Math.max(nearHorizon, slope);
      if (d >= 240 && d <= 600 && nearHorizon < 0.025) {
        const lowSide = h < -5 ? openness(this.world.land, this.world.rules.slot, index * STEP, side) : 0;
        opening = Math.max(opening, smoothstep(6, 20, -h), smoothstep(0.45, 0.8, lowSide));
      }
      if (d >= 1600 && nearHorizon < 0.085 && slope > horizon)
        opening = Math.max(opening, smoothstep(0.09, 0.17, slope - nearHorizon));
      horizon = Math.max(horizon, slope);
    }
    if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, opening);
    return opening;
  }

  /** Full-size below the subalpine belt, stunted at the limit; only saplings survive on an open verge. */
  treeScale(tp: TerrainPoint, dice: number): number {
    const lineA = BIOMES[tp.ba].relief?.trees ?? 1e5;
    const lineB = BIOMES[tp.bb].relief?.trees ?? 1e5;
    const below = lineA + (lineB - lineA) * tp.bt - this.world.spine.altitude(tp.bed);
    if (below <= 0) return 0;
    const open = this.clearing(tp.s, tp.d);
    if ((dice & 0xffff) / 65536 < open * 0.98) return 0;
    return (0.25 + 0.75 * smoothstep(0, 160, below)) * (1 - open * 0.8);
  }

  clearing(s: number, d: number): number {
    const distance = Math.abs(d);
    if (distance >= 112) return 0;
    const station = s / STEP;
    const i = Math.floor(station);
    const side = d < 0 ? -1 : 1;
    const a = this.station(i, side);
    const b = this.station(i + 1, side);
    return (a + (b - a) * smoothstep(0, 1, station - i)) * (1 - smoothstep(60, 112, distance));
  }
}
