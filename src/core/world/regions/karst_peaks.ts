/**
 * Karst peaks (喀斯特峰林): scenic. A flat valley floor among sugarloaf towers: in five stretches of a
 * chapter a cluster of six to twelve stands beside the road (features.ts), and beyond them the far country
 * is towers to the skyline (far shape 3). A river in every second stretch.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const KARST_PEAKS: RegionDef = {
  id: 'karst_peaks',
  label: '喀斯特峰林',
  kin: 'plains',
  designKmh: 60,
  straightMin: 120,
  straightMax: 600,
  straightChance: 0.5,
  turnMin: 14,
  turnMax: 62,
  radiusSpread: 4,
  gradeAmp: 0.02,
  gradeMax: 0.04,
  gradeLen: 1300,
  baseElev: 90,
  nearAmp: 2,
  nearLen: 280,
  detailAmp: 0.5,
  detailLen: 40,
  farAmp: 260,
  farLen: 520,
  farStart: 420,
  farEnd: 1100,
  farShape: 3,
  massifAmp: 1300,
  vergeBlend: 26,
  ditch: 0.25,
  ground: Surface.Grass,
  tempDay: 25,
  tempNight: 17,
  intensity: 'scenic',
  family: { palette: 'jade', land: 'towers', flora: 'subtropical' },
  climate: 'warm',
  land: { odds: { open: 0.7, valley: 0.2, hillside: 0.1 }, size: { tilt: 0.1, wall: 60, drop: 25, canyon: 0 } },
  water: { lake: 0.22, river: 0.5, frozen: 0, clear: 5 },
  features: [{ kind: 'tower', count: [6, 12], radius: [45, 105], aspect: [0.8, 1.05], near: 70, far: 760, stretch: [1, 1.5] }],
  featureSlots: 5,
};
