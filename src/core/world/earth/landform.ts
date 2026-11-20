/**
 * The landforms of the emergent Earth on the world's land (docs/V3/nodes/E2-earth-land.md): what each of the
 * director's landforms (core/earth/landforms.ts, 55 of them) is made of in the land function — anchored forms
 * beside the road (features.ts: towers, tables, cones and domes in clusters), dune fields of four shapes
 * (operators.ts dunes), benches (operators.ts terrace), the kinds of country its stretches are (landform.ts:
 * open, hillside, valley, ridge, canyon) and how strong, its hills, its valley walls, version 1's far field of
 * mesas — sized by how high the place's country rises (its relief).
 *
 * Pure data and arithmetic over the place: the land function reads the region made of it.
 */
import type { RegionRelief } from '../biomes';
import type { FeatureRecipe } from '../features';
import type { LandKind, LandSize } from '../landform';
import type { DuneShape } from '../operators';
import type { Scene } from '../../earth/director';

/** what a place's landform makes of its region's land */
export interface PlaceLand {
  features?: readonly FeatureRecipe[];
  /** of a place's four stretches, how many hold a cluster of its features */
  featureSlots?: number;
  dune?: { amp: number; len: number; shape: DuneShape };
  terrace?: { step: number; strength: number };
  odds?: Partial<Record<LandKind, number>>;
  size?: Partial<LandSize>;
  hills?: { amp: number; len: number };
  walls?: RegionRelief['walls'];
  /** version 1's far field: how much of it (0 … 1) and its shape (2: mesas) */
  far?: number;
  farShape?: number;
  /** the ranges beyond stand this much higher (share) */
  ranges?: number;
}

const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
type Span = readonly [number, number];
const F = (kind: FeatureRecipe['kind'], radius: Span, aspect: Span, count: Span, near: number, far: number, o: Partial<FeatureRecipe> = {}): FeatureRecipe => ({ kind, radius, aspect, count, near, far, ...o });

/** a place's landform in its land, sized by its relief (m) */
export function landOfPlace(sc: Scene): PlaceLand {
  const R = Math.max(10, sc.macro.relief);
  const id = sc.look.landform.id;
  const walls = (floorM: number, lo: number, hi: number, steep: Span, crest: number): RegionRelief['walls'] => ({ height: [Math.round(lo * R), Math.round(hi * R)], floor: floorM, steep, crest: Math.round(clamp(crest, 1200, 3200)) });
  switch (id) {
    // ---- the wind's
    case 'dune_barchan':
      return { dune: { amp: clamp(0.08 * R, 5, 12), len: 150, shape: 3 }, odds: { open: 0.9, ridge: 0.1 }, hills: { amp: 2, len: 900 } };
    case 'dune_star':
      return { dune: { amp: clamp(0.8 * R, 60, 220), len: clamp(3.4 * R, 500, 900), shape: 2 }, odds: { open: 0.95, ridge: 0.05 }, hills: { amp: 0, len: 900 } };
    case 'dune_linear':
      return { dune: { amp: clamp(0.3 * R, 14, 36), len: clamp(5 * R, 260, 520), shape: 1 }, odds: { open: 0.9, ridge: 0.1 }, hills: { amp: 0, len: 900 } };
    case 'dune_coastal':
      return { dune: { amp: clamp(0.4 * R, 8, 22), len: 160, shape: 0 }, odds: { open: 0.7, hillside: 0.3 } };
    case 'gypsum_dunes':
      return { dune: { amp: clamp(0.5 * R, 5, 12), len: 110, shape: 0 }, odds: { open: 1 }, hills: { amp: 0, len: 900 } };
    case 'yardang':
      return { features: [F('tower', [25, 60], [0.35, 0.6], [10, 18], 50, 800, { stretch: [3, 5] })], featureSlots: 3, odds: { open: 0.9, ridge: 0.1 }, hills: { amp: 2, len: 900 } };
    // ---- running water's
    case 'canyon':
      return { odds: { canyon: 0.55, open: 0.2, ridge: 0.25 }, size: { canyon: clamp(0.5 * R, 60, 200) }, far: 1, farShape: 2 };
    case 'meander_valley':
      return { odds: { valley: 0.65, hillside: 0.25, open: 0.1 }, size: { wall: clamp(0.4 * R, 40, 180) } };
    case 'braided_river':
      return { odds: { open: 0.85, valley: 0.15 }, hills: { amp: clamp(0.05 * R, 2, 12), len: 900 } };
    case 'alluvial_fan':
      return { odds: { open: 0.55, hillside: 0.45 }, size: { tilt: 0.07 } };
    case 'badlands':
      return { odds: { open: 0.45, ridge: 0.3, canyon: 0.25 }, size: { canyon: clamp(0.25 * R, 25, 60) }, hills: { amp: clamp(0.25 * R, 18, 70), len: 220 } };
    case 'waterfall_gorge':
      return { odds: { canyon: 0.5, valley: 0.35, hillside: 0.15 }, size: { canyon: clamp(0.4 * R, 50, 160), wall: clamp(0.3 * R, 40, 160) } };
    case 'delta':
      return { odds: { open: 1 }, hills: { amp: 1, len: 900 } };
    // ---- the ice's
    case 'u_valley':
    case 'glacier':
      return { walls: walls(450, 0.7, 1, [0.55, 0.85], 1.6 * R), odds: { valley: 0.7, hillside: 0.25, open: 0.05 } };
    case 'horn_arete':
      return { walls: walls(220, 0.8, 1.15, [0.5, 0.8], 1.4 * R), odds: { valley: 0.5, hillside: 0.4, ridge: 0.1 }, ranges: 1.3 };
    case 'moraine_lake':
      return { walls: walls(350, 0.6, 0.95, [0.45, 0.75], 1.6 * R), odds: { valley: 0.6, hillside: 0.3, open: 0.1 } };
    case 'fjord':
      return { walls: walls(600, 0.8, 1.1, [0.6, 0.9], 1.5 * R), odds: { hillside: 0.6, valley: 0.4 } };
    case 'drumlins':
      return { features: [F('dome', [35, 70], [0.15, 0.3], [8, 16], 50, 600, { stretch: [2, 3.2] })], featureSlots: 3, odds: { open: 0.8, hillside: 0.2 } };
    // ---- the frozen ground's
    case 'patterned_ground':
      return { odds: { open: 1 }, hills: { amp: 1, len: 900 } };
    case 'pingo':
      return { features: [F('dome', [25, 55], [0.35, 0.55], [2, 4], 80, 800)], featureSlots: 2, odds: { open: 1 }, hills: { amp: 1, len: 900 } };
    // ---- the karst's
    case 'tower_karst':
      return { features: [F('tower', [45, 105], [0.8, 1.05], [6, 12], 70, 760, { stretch: [1, 1.5] })], featureSlots: 3, odds: { open: 0.7, valley: 0.2, hillside: 0.1 }, far: 1 };
    case 'cone_karst':
      return { features: [F('tower', [80, 150], [0.55, 0.8], [8, 14], 70, 900)], featureSlots: 3, odds: { open: 0.5, valley: 0.4, hillside: 0.1 } };
    case 'pillar_mountain':
      return { features: [F('tower', [25, 55], [0.95, 1.05], [10, 18], 60, 700)], featureSlots: 3, odds: { valley: 0.5, open: 0.3, hillside: 0.2 } };
    case 'sinkholes':
      return { hills: { amp: clamp(0.12 * R, 8, 25), len: 200 }, odds: { open: 0.7, hillside: 0.3 } };
    case 'travertine':
      return { terrace: { step: 1.6, strength: 1 }, odds: { hillside: 0.6, valley: 0.3, open: 0.1 } };
    case 'stone_forest':
      return { features: [F('tower', [5, 12], [0.9, 1.05], [24, 40], 40, 260)], featureSlots: 3, odds: { open: 0.8, hillside: 0.2 } };
    // ---- the fire's
    case 'cinder_cones':
      return { features: [F('cone', [120, 260], [0.4, 0.6], [2, 5], 120, 1600)], featureSlots: 2, odds: { open: 0.8, ridge: 0.2 } };
    case 'stratovolcano':
      return { features: [F('cone', [1400, 2400], [0.55, 0.7], [1, 1], 3000, 7000, { oneSide: true })], featureSlots: 1, odds: { open: 0.6, hillside: 0.4 } };
    case 'crater_lake':
      return { features: [F('cone', [400, 700], [0.3, 0.45], [1, 1], 600, 2500, { oneSide: true })], featureSlots: 1, odds: { open: 0.6, hillside: 0.4 } };
    case 'lava_field':
      return { odds: { open: 0.85, ridge: 0.15 }, hills: { amp: 4, len: 45 } };
    case 'columnar_basalt':
      return { odds: { canyon: 0.3, ridge: 0.3, open: 0.4 }, size: { canyon: clamp(0.3 * R, 25, 60) } };
    case 'geothermal':
      return { odds: { open: 0.8, hillside: 0.2 }, hills: { amp: clamp(0.06 * R, 3, 12), len: 220 } };
    // ---- the earth's movements
    case 'mesas_buttes':
      return { features: [F('butte', [70, 150], [0.32, 0.5], [2, 4], 110, 900, { stretch: [1, 2.4], oneSide: true })], featureSlots: 3, odds: { open: 0.7, ridge: 0.2, canyon: 0.1 }, far: 1, farShape: 2 };
    case 'cuestas':
      return { odds: { hillside: 0.6, ridge: 0.3, open: 0.1 }, size: { tilt: 0.22 } };
    case 'escarpment':
      return { odds: { hillside: 0.75, ridge: 0.25 }, size: { tilt: 0.28 } };
    case 'rift_valley':
      return { walls: walls(1400, 0.6, 1, [0.35, 0.6], 3000), odds: { open: 0.7, valley: 0.3 } };
    case 'tepui':
      return { features: [F('butte', [350, 700], [0.4, 0.5], [1, 2], 400, 3000, { oneSide: true })], featureSlots: 2, far: 1, farShape: 2 };
    case 'fold_mountains':
      return { odds: { valley: 0.5, hillside: 0.4, ridge: 0.1 } };
    // ---- weathering's
    case 'inselberg':
      return { features: [F('dome', [180, 380], [0.45, 0.75], [1, 2], 300, 2200, { oneSide: true })], featureSlots: 2, odds: { open: 0.9, ridge: 0.1 } };
    case 'tors':
      return { features: [F('dome', [10, 26], [0.7, 1], [6, 12], 40, 360)], featureSlots: 3, odds: { open: 0.5, ridge: 0.3, hillside: 0.2 } };
    case 'danxia':
      return { features: [F('butte', [120, 260], [0.4, 0.5], [2, 4], 150, 1200, { stretch: [1.5, 3] })], featureSlots: 3, odds: { valley: 0.4, open: 0.4, hillside: 0.2 } };
    case 'hoodoos':
      return { features: [F('tower', [3, 7], [0.95, 1.05], [30, 50], 40, 220)], featureSlots: 3, odds: { open: 0.5, canyon: 0.3, ridge: 0.2 }, size: { canyon: 40 } };
    // ---- the sea's
    case 'sea_cliffs':
    case 'sea_stacks':
      return { odds: { ridge: 0.6, hillside: 0.4 }, size: { drop: clamp(0.4 * R, 30, 120) } };
    case 'beach_spit':
    case 'barrier_lagoon':
    case 'coral_cays':
      return { odds: { open: 1 }, hills: { amp: 1, len: 900 } };
    case 'island_chain':
      return { odds: { open: 0.8, hillside: 0.2 }, hills: { amp: clamp(0.1 * R, 2, 12), len: 700 } };
    // ---- the salt's
    case 'salt_flat':
      return { odds: { open: 1 }, hills: { amp: 0, len: 900 } };
    case 'salt_lake':
      return { odds: { open: 1 }, hills: { amp: 1, len: 900 } };
    default:
      return {};
  }
}
