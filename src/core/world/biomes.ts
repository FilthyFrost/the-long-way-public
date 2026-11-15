/**
 * Biome definitions: how the road behaves and how the land rises around it.
 * Plain data — the renderer adds palettes on top of these ids.
 */
import { Surface } from './ground';

export interface BiomeDef {
  id: string;
  label: string;
  /**
   * Which of the three first kinds of country it behaves like wherever nothing says otherwise:
   * temperate and green, dry, or cold. Weather, what grows, what lies on a wreck all start from this.
   */
  kin: 'plains' | 'desert' | 'alpine';
  // ---- road style
  /** design speed: sets the tightest curve and the banking */
  designKmh: number;
  straightMin: number;
  straightMax: number;
  /** chance that a curve is followed by a straight rather than another curve */
  straightChance: number;
  /** heading change of one curve (deg) */
  turnMin: number;
  turnMax: number;
  /** curve radii range from the minimum up to this multiple of it */
  radiusSpread: number;
  /** typical and maximum grade (rise per metre) and the length scale of climbs (m) */
  gradeAmp: number;
  gradeMax: number;
  gradeLen: number;
  /** elevation the road drifts back to (m) */
  baseElev: number;
  // ---- land
  /** rolling relief beside the road: amplitude (m) and wavelength (m) */
  nearAmp: number;
  nearLen: number;
  detailAmp: number;
  detailLen: number;
  /** big landforms away from the road */
  farAmp: number;
  farLen: number;
  /** lateral distance where the big landforms start / reach full height (m) */
  farStart: number;
  farEnd: number;
  /** 0 = rounded hills, 1 = sharp ridges, 2 = flat-topped mesas */
  farShape: 0 | 1 | 2;
  /** height (m) of the mountain massifs that stand kilometres back from the road, on the skyline */
  massifAmp: number;
  /** width over which the verge blends from road level into the land (m) */
  vergeBlend: number;
  ditch: number;
  ground: number;
  // ---- climate (used by weather and, later, survival)
  tempDay: number;
  tempNight: number;
}

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'plains',
    label: '草原丘陵',
    kin: 'plains',
    designKmh: 70,
    straightMin: 140,
    straightMax: 650,
    straightChance: 0.55,
    turnMin: 14,
    turnMax: 62,
    radiusSpread: 4.5,
    gradeAmp: 0.045,
    gradeMax: 0.06,
    gradeLen: 900,
    baseElev: 60,
    nearAmp: 6.5,
    nearLen: 230,
    detailAmp: 0.9,
    detailLen: 37,
    farAmp: 190,
    farLen: 1400,
    farStart: 160,
    farEnd: 1300,
    farShape: 0,
    massifAmp: 1500,
    vergeBlend: 24,
    ditch: 0.32,
    ground: Surface.Grass,
    tempDay: 22,
    tempNight: 11,
  },
  {
    id: 'desert',
    label: '荒漠公路',
    kin: 'desert',
    designKmh: 85,
    straightMin: 500,
    straightMax: 2600,
    straightChance: 0.8,
    turnMin: 8,
    turnMax: 38,
    radiusSpread: 5,
    gradeAmp: 0.022,
    gradeMax: 0.04,
    gradeLen: 1600,
    baseElev: 120,
    nearAmp: 2.6,
    nearLen: 310,
    detailAmp: 1.1,
    detailLen: 53,
    farAmp: 130,
    farLen: 950,
    farStart: 260,
    farEnd: 620,
    farShape: 2,
    massifAmp: 900,
    vergeBlend: 30,
    ditch: 0.12,
    ground: Surface.Sand,
    tempDay: 38,
    tempNight: 9,
  },
  {
    id: 'alpine',
    label: '针叶雪山',
    kin: 'alpine',
    designKmh: 45,
    straightMin: 40,
    straightMax: 210,
    straightChance: 0.3,
    turnMin: 22,
    turnMax: 78,
    radiusSpread: 3.2,
    gradeAmp: 0.075,
    gradeMax: 0.08,
    gradeLen: 700,
    baseElev: 420,
    nearAmp: 9,
    nearLen: 170,
    detailAmp: 1.6,
    detailLen: 29,
    farAmp: 520,
    farLen: 2100,
    farStart: 70,
    farEnd: 1500,
    farShape: 1,
    massifAmp: 2200,
    vergeBlend: 18,
    ditch: 0.3,
    ground: Surface.Snow,
    tempDay: -4,
    tempNight: -16,
  },
  // ---- the second round (docs/DESIGN_V2.md 4.1): they come from the fifth chapter on (spine.ts)
  {
    // tall trees close to the road on both sides, the light in patches, the road winding between them
    id: 'forest',
    label: '森林',
    kin: 'plains',
    designKmh: 60,
    straightMin: 80,
    straightMax: 380,
    straightChance: 0.42,
    turnMin: 16,
    turnMax: 70,
    radiusSpread: 4,
    gradeAmp: 0.05,
    gradeMax: 0.065,
    gradeLen: 800,
    baseElev: 140,
    nearAmp: 7.5,
    nearLen: 190,
    detailAmp: 1.1,
    detailLen: 33,
    farAmp: 215,
    farLen: 1550,
    farStart: 110,
    farEnd: 1100,
    farShape: 0,
    massifAmp: 1700,
    vergeBlend: 20,
    ditch: 0.34,
    ground: Surface.Grass,
    tempDay: 17,
    tempNight: 8,
  },
  {
    // low, open country full of water: a lake in most stretches, reeds, morning fog
    id: 'lakes',
    label: '湖区',
    kin: 'plains',
    designKmh: 65,
    straightMin: 120,
    straightMax: 520,
    straightChance: 0.5,
    turnMin: 12,
    turnMax: 58,
    radiusSpread: 4.5,
    gradeAmp: 0.03,
    gradeMax: 0.045,
    gradeLen: 1100,
    baseElev: 40,
    nearAmp: 4,
    nearLen: 260,
    detailAmp: 0.7,
    detailLen: 41,
    farAmp: 150,
    farLen: 1600,
    farStart: 220,
    farEnd: 1500,
    farShape: 0,
    massifAmp: 1300,
    vergeBlend: 26,
    ditch: 0.25,
    ground: Surface.Grass,
    tempDay: 19,
    tempNight: 10,
  },
  {
    // hill country in its autumn: the road along the slopes, every wood red and gold, leaves in the air
    id: 'maple',
    label: '枫叶丘陵',
    kin: 'plains',
    designKmh: 60,
    straightMin: 100,
    straightMax: 420,
    straightChance: 0.45,
    turnMin: 16,
    turnMax: 66,
    radiusSpread: 4.2,
    gradeAmp: 0.055,
    gradeMax: 0.07,
    gradeLen: 800,
    baseElev: 180,
    nearAmp: 8,
    nearLen: 210,
    detailAmp: 1.0,
    detailLen: 35,
    farAmp: 225,
    farLen: 1650,
    farStart: 130,
    farEnd: 1200,
    farShape: 0,
    massifAmp: 1600,
    vergeBlend: 22,
    ditch: 0.3,
    ground: Surface.Grass,
    tempDay: 14,
    tempNight: 5,
  },
];

/** the three kinds of country the journey begins in; the others join from the fifth chapter on */
export const FIRST_BIOMES = 3;

export const BIOME_INDEX: Record<string, number> = Object.fromEntries(BIOMES.map((b, i) => [b.id, i]));

/** tightest curve radius (m) for a design speed, from the usual highway formula R = V² / (127 (e + f)) */
export function minRadius(designKmh: number): number {
  const f = 0.2 - 0.00075 * designKmh;
  return (designKmh * designKmh) / (127 * (0.06 + f));
}

/** absolute floor for any curve; the road-aligned mesh strips rely on it */
export const MIN_RADIUS_ANY = 60;
