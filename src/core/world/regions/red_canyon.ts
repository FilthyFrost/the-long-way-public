/**
 * Red rock canyon (红岩峡谷): scenic. Dry country of red stone: the road between canyon walls in two
 * stretches of five, mesas beyond them, and in three stretches of a chapter a group of buttes standing
 * near the road on one side of it (features.ts).
 *
 * Its mesas begin 340 m from the road and its canyon walls stand 85 m at most. Nearer and taller (120 m
 * and 110 m in the first draft) the mesas' edges and the walls stood steeper than the land may within a
 * quarter of a kilometre of the road (the land card: a step of 1.60 m in half a metre against 1.15, a
 * kink of 1.62 against 0.5); what stands near the road here is the buttes, which keep their own rules.
 *
 * A region of the registry (index.ts lists it; its place there is its identity). Worlds of version 2 deal
 * it; worlds of version 1 never see it.
 */
import type { RegionDef } from '../biomes';
import { Surface } from '../ground';

export const RED_CANYON: RegionDef = {
  id: 'red_canyon',
  label: '红岩峡谷',
  kin: 'desert',
  designKmh: 65,
  straightMin: 160,
  straightMax: 900,
  straightChance: 0.55,
  turnMin: 14,
  turnMax: 60,
  radiusSpread: 4.2,
  gradeAmp: 0.04,
  gradeMax: 0.06,
  gradeLen: 1000,
  baseElev: 240,
  nearAmp: 3,
  nearLen: 260,
  detailAmp: 1.2,
  detailLen: 47,
  farAmp: 210,
  farLen: 800,
  farStart: 340,
  farEnd: 780,
  farShape: 2,
  massifAmp: 1000,
  vergeBlend: 26,
  ditch: 0.14,
  ground: Surface.Sand,
  tempDay: 34,
  tempNight: 10,
  intensity: 'scenic',
  family: { palette: 'redrock', land: 'canyon', flora: 'scrub' },
  climate: 'dry',
  land: { odds: { canyon: 0.42, open: 0.3, hillside: 0.12, ridge: 0.16 }, size: { tilt: 0.16, wall: 80, drop: 45, canyon: 85 } },
  water: { lake: 0.04, river: 0.2, frozen: 0, clear: 8 },
  features: [{ kind: 'butte', count: [2, 4], radius: [70, 150], aspect: [0.32, 0.5], near: 110, far: 900, stretch: [1, 2.4], oneSide: true }],
  featureSlots: 3,
};
