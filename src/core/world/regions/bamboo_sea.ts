/**
 * Bamboo sea (竹海): scenic. Steep, wooded valleys and slopes of the forest's kind, under bamboo: the road
 * winds along the valley floors and the hillsides, a river in two stretches of five.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const BAMBOO_SEA: RegionDef = {
  id: 'bamboo_sea',
  label: '竹海',
  kin: 'plains',
  designKmh: 55,
  straightMin: 50,
  straightMax: 260,
  straightChance: 0.35,
  turnMin: 20,
  turnMax: 75,
  radiusSpread: 3.4,
  gradeAmp: 0.06,
  gradeMax: 0.07,
  gradeLen: 750,
  baseElev: 260,
  nearAmp: 7,
  nearLen: 190,
  detailAmp: 0.9,
  detailLen: 31,
  farAmp: 360,
  farLen: 1500,
  farStart: 110,
  farEnd: 1300,
  farShape: 0,
  massifAmp: 1800,
  vergeBlend: 18,
  ditch: 0.3,
  ground: Surface.Grass,
  tempDay: 24,
  tempNight: 16,
  intensity: 'scenic',
  family: { palette: 'bamboo', land: 'valley', flora: 'bamboo' },
  climate: 'warm',
  land: { odds: { valley: 0.42, hillside: 0.4, ridge: 0.12, open: 0.06 }, size: { tilt: 0.28, wall: 140, drop: 60, canyon: 0 } },
  water: { lake: 0.16, river: 0.42, frozen: 0, clear: 7 },
  relief: { base: 260, snow: 4600, trees: 3400, hills: { amp: 105, len: 820 }, far: 0, ranges: { amp: 650, from: 2500, full: 11000 }, size: { tilt: 0.14, wall: 60, drop: 36 } },
};
