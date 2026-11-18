/**
 * Terraced hills (梯田山乡): calm. Farming country on slopes: the hillsides and the valley sides are cut
 * into level benches four metres apart (operators.ts), rice and tea on them. A slow road that keeps to the
 * slopes, seldom straight for long.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const TERRACES: RegionDef = {
  id: 'terraces',
  label: '梯田山乡',
  kin: 'plains',
  designKmh: 55,
  straightMin: 60,
  straightMax: 320,
  straightChance: 0.4,
  turnMin: 18,
  turnMax: 70,
  radiusSpread: 3.6,
  gradeAmp: 0.055,
  gradeMax: 0.07,
  gradeLen: 800,
  baseElev: 180,
  nearAmp: 5,
  nearLen: 200,
  detailAmp: 0.7,
  detailLen: 33,
  farAmp: 300,
  farLen: 1500,
  farStart: 120,
  farEnd: 1300,
  farShape: 0,
  massifAmp: 1700,
  vergeBlend: 20,
  ditch: 0.3,
  ground: Surface.Grass,
  tempDay: 26,
  tempNight: 17,
  intensity: 'calm',
  family: { palette: 'paddy', land: 'terraced', flora: 'crops' },
  climate: 'warm',
  land: {
    odds: { hillside: 0.6, valley: 0.25, open: 0.1, ridge: 0.05 },
    size: { tilt: 0.3, wall: 120, drop: 50, canyon: 0 },
    terrace: { step: 4, strength: 1 },
  },
  water: { lake: 0.22, river: 0.3, frozen: 0, clear: 6 },
};
