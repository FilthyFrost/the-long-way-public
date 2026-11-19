/**
 * Flower fields (花海原野): calm. Wide, gently rolling country — the plains with their near relief halved —
 * where the colour is the plants' doing: rows of bloom to the horizon, beehives by the road. A fast, easy
 * road with long straights.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const FLOWER_FIELDS: RegionDef = {
  id: 'flower_fields',
  label: '花海原野',
  kin: 'plains',
  designKmh: 72,
  straightMin: 180,
  straightMax: 800,
  straightChance: 0.6,
  turnMin: 12,
  turnMax: 55,
  radiusSpread: 4.5,
  gradeAmp: 0.03,
  gradeMax: 0.05,
  gradeLen: 1100,
  baseElev: 70,
  nearAmp: 3.2,
  nearLen: 260,
  detailAmp: 0.6,
  detailLen: 40,
  farAmp: 140,
  farLen: 1500,
  farStart: 220,
  farEnd: 1500,
  farShape: 0,
  massifAmp: 1200,
  vergeBlend: 26,
  ditch: 0.28,
  ground: Surface.Grass,
  tempDay: 23,
  tempNight: 12,
  intensity: 'calm',
  family: { palette: 'bloom', land: 'rolling', flora: 'flowers' },
  climate: 'temperate',
  land: { odds: { open: 0.5, hillside: 0.3, valley: 0.05, ridge: 0.15 }, size: { tilt: 0.12, wall: 50, drop: 30, canyon: 0 } },
  water: { lake: 0.3, river: 0.18, frozen: 0, clear: 6 },
  relief: { base: 70, snow: 3000, trees: 2200, hills: { amp: 24, len: 640 }, far: 0, ranges: { amp: 480, from: 2500, full: 9000 }, size: { tilt: 0.06, wall: 26, drop: 16 } },
};
