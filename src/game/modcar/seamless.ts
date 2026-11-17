/**
 * The workshop as a place in the world (docs/MODCAR.md §17): one world, the road beginning at the workshop's gate
 * (core/world WorldOptions.start, deadEnd), its yard a plot of the world's land (garageOutdoors YARD_PLOT). What
 * the wheels and the feet stand on is the garage's own ground on the plot — the slab, the yard, the meadow round
 * them, the benches — and the world's land beyond it; the land takes the plot's height within it, so the two meet
 * level at its edge.
 */
import { GroundSample, type Ground } from '../../core/world/ground';
import type { Land } from '../../core/onfoot/land';
import type { TerrainPoint, World, WorldOptions } from '../../core/world/terrain';
import { onPlot, ROAD_START_X, YARD_PLOT } from './garageOutdoors';

/**
 * How likely a stretch of road (1.25 km) is to have a place by it, one, two, three or more stretches after the last
 * (sites.ts): a place most stretches, the next one seldom more than a stretch on (Arctic Drive's buildings come every
 * few hundred metres; the old game's one every three kilometres or so)
 */
export const MODCAR_PLACE_ODDS: readonly [number, number, number] = [0.62, 0.88, 1];

/** … and a second place in most stretches that have one */
export const MODCAR_SECOND_PLACE = 0.8;

/** ModCar's world: the road begins at the workshop's gate, level with its yard, and the yard is a plot of its land */
export function modcarWorldOptions(o: { chapterScale?: number; startBiome?: string }): WorldOptions {
  return { ...o, start: { x: ROAD_START_X, z: 0, y: 0 }, deadEnd: true, plots: [YARD_PLOT], placeOdds: MODCAR_PLACE_ODDS, secondPlace: MODCAR_SECOND_PLACE };
}

/** the wheels' ground: the garage's on its plot, the world's beyond */
export class SeamlessGround implements Ground {
  constructor(
    private readonly garage: Ground,
    private readonly world: World,
  ) {}

  sample(x: number, z: number, out: GroundSample): void {
    if (onPlot(x, z)) this.garage.sample(x, z, out);
    else this.world.sample(x, z, out);
  }
}

/** the feet's land: the garage's on its plot, the world's beyond (its water, its bridge decks) */
export class SeamlessLand implements Land {
  constructor(
    private readonly garage: Land,
    private readonly world: World,
  ) {}

  shape(x: number, z: number, o: TerrainPoint): void {
    if (onPlot(x, z)) this.garage.shape(x, z, o);
    else this.world.shape(x, z, o);
  }
}

export { GroundSample };
