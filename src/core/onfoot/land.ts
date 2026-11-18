/**
 * What a walker stands on: the land's shape (World.shape gives height, water and bridge decks).
 * The world implements this as it is; the proving ground and the tests use the small stand-ins here.
 */
import type { Ground } from '../world/ground';
import { GroundSample } from '../world/ground';
import { TerrainPoint } from '../world/terrain';

export interface Land {
  /** fills h (what one stands on: a bridge deck, ice), bed (the land under a deck), wl (water level, −Infinity = none), bridge (0…1) */
  shape(x: number, z: number, o: TerrainPoint): void;
}

/** a land given by plain functions: flat, a ramp, a pond — for tests and the measurements */
export class FunctionLand implements Land {
  constructor(
    readonly height: (x: number, z: number) => number,
    readonly water: (x: number, z: number) => number = () => -Infinity,
  ) {}

  shape(x: number, z: number, o: TerrainPoint): void {
    o.h = o.bed = this.height(x, z);
    o.wl = this.water(x, z);
    o.bridge = 0;
    o.zone = 0;
    o.frozen = 0;
    o.landform = 0;
  }
}

/** any vehicle ground (the proving ground) seen as land: no water, no decks */
export class GroundLand implements Land {
  private readonly gs = new GroundSample();
  constructor(readonly ground: Ground) {}

  shape(x: number, z: number, o: TerrainPoint): void {
    this.ground.sample(x, z, this.gs);
    o.h = o.bed = this.gs.h;
    o.wl = -Infinity;
    o.bridge = 0;
    o.zone = 0;
    o.frozen = 0;
    o.landform = 0;
  }
}

export { TerrainPoint };
