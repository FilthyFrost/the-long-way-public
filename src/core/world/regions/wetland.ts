/**
 * Wetland (湿地沼泽): calm. Flat, low and full of water: a lake in three stretches of four, reeds, cranberry
 * and watercress at the water's edge, the road barely above it all. Long easy curves, hardly a grade.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const WETLAND: RegionDef = {
  id: 'wetland',
  label: '湿地沼泽',
  kin: 'plains',
  designKmh: 65,
  straightMin: 200,
  straightMax: 900,
  straightChance: 0.6,
  turnMin: 12,
  turnMax: 50,
  radiusSpread: 4.5,
  gradeAmp: 0.012,
  gradeMax: 0.025,
  gradeLen: 1600,
  baseElev: 25,
  nearAmp: 1.4,
  nearLen: 300,
  detailAmp: 0.35,
  detailLen: 45,
  farAmp: 60,
  farLen: 1800,
  farStart: 500,
  farEnd: 2400,
  farShape: 0,
  massifAmp: 700,
  vergeBlend: 30,
  ditch: 0.2,
  ground: Surface.Grass,
  tempDay: 20,
  tempNight: 12,
  intensity: 'calm',
  family: { palette: 'marsh', land: 'flat', flora: 'reeds' },
  climate: 'temperate',
  land: { odds: { open: 0.85, hillside: 0.1, ridge: 0.05 }, size: { tilt: 0.06, wall: 30, drop: 12, canyon: 0 } },
  water: { lake: 0.78, river: 0.12, frozen: 0, clear: 3.5 },
  relief: { base: 25, snow: 3000, trees: 2200, hills: { amp: 7, len: 600 }, far: 0, ranges: { amp: 420, from: 2500, full: 9000 } },
};
