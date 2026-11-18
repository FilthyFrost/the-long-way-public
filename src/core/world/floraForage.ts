/**
 * Where the things one forages from the ground grow (docs/V3/nodes/W3-forage.md): one row per forage plant,
 * saying how common it is, which kind of spot it likes, and in which regions it grows. The rows are grown into
 * the regions' flora tables as rules (withForage), so the flora field answers "what grows here" for them as
 * for trees: there is no second generator.
 *
 * A spot is one of a handful of named niches (the wood's floor, its edge, a meadow, a bank, the shallows, the
 * strand …): bands of the ecotope's quantities. How common is a number of plants to the hectare where the spot
 * suits; things come in patches (groves), so a hectare that has a kind has several and the next has none.
 *
 * To make a kind grow somewhere else, add the region's id to its row; to add a kind, add its plant to
 * plants.ts and a row here.
 */
import type { Band, FloraRule, FloraTable } from './flora';
import { plantDef } from './plants';

const LAKE = 1;
const RIVER = 2;
const SEA = 4;
const FRESH = LAKE | RIVER;

/** the kinds of spot */
type Niche = Omit<FloraRule, 'plant' | 'perHa' | 'grove' | 'size'>;
const b = (lo: number, hi: number): Band => [lo, hi];
const N = {
  /** under closed wood, on damp ground */
  woodFloor: { canopy: b(0.5, 1), moisture: b(0.4, 0.95) },
  /** under wood on drier ground: pine woods */
  woodDry: { canopy: b(0.4, 1), moisture: b(0.12, 0.55) },
  /** where wood meets open ground */
  woodEdge: { canopy: b(0.15, 0.55) },
  /** under wood on a slope turned from the sun */
  shadeSlope: { canopy: b(0.4, 1), shade: b(0.6, 1), slope: b(0.08, 1) },
  /** open grass, neither dry nor wet */
  meadow: { canopy: b(0, 0.2), moisture: b(0.3, 0.8) },
  /** open wet ground */
  wetMeadow: { canopy: b(0, 0.35), moisture: b(0.7, 1) },
  /** open dry ground */
  dryOpen: { canopy: b(0, 0.2), moisture: b(0, 0.3) },
  /** by the road: verges and waste ground */
  verge: { road: b(8, 40), canopy: b(0, 0.4) },
  /** level open ground within reach of the road: old fields and gardens */
  field: { slope: b(0, 0.07), canopy: b(0, 0.15), road: b(8, 170) },
  /** the bank of fresh water */
  bank: { water: b(0, 10), waterKinds: FRESH },
  /** in the shallows of fresh water (the plant is one of the water) */
  shallows: { water: b(0, 2), waterKinds: FRESH },
  /** the sea's strand */
  strand: { water: b(0, 14), waterKinds: SEA, slope: b(0, 0.2) },
  /** rock by the sea */
  seaRock: { water: b(0, 10), waterKinds: SEA, slope: b(0.12, 2) },
  /** a salt lake's or the sea's flat shore */
  saltShore: { water: b(0, 30), slope: b(0, 0.08), canopy: b(0, 0.1) },
  /** open stony slopes in the sun */
  rocky: { slope: b(0.3, 2), canopy: b(0, 0.4), shade: b(0, 0.55) },
  /** dry cut banks and gravel: river flats, canyon floors */
  gravel: { water: b(2, 60), canopy: b(0, 0.3), moisture: b(0, 0.5) },
  /** open ground high above the valley */
  highMeadow: { relief: b(90, 260), canopy: b(0, 0.2) },
  /** rock clefts above the trees */
  highRock: { relief: b(150, 400), slope: b(0.2, 2) },
} satisfies Record<string, Niche>;

/** plants to the hectare where the spot suits, by how common the kind is */
const PER_HA = { common: 7, uncommon: 3.2, rare: 1.1, legendary: 0.12 };

interface Row {
  /** the plant (plants.ts): `<kind>_plant` */
  readonly plant: string;
  readonly perHa: number;
  readonly niche: Niche;
  /** the size of its patches (m) */
  readonly grove: number;
  readonly regions: readonly string[];
}

const ROWS: Row[] = [];

function G(kind: string, common: keyof typeof PER_HA, niche: Niche, grove: number, regions: readonly string[], times = 1): void {
  ROWS.push({ plant: `${kind}_plant`, perHa: PER_HA[common] * times, niche, grove, regions });
}

// ---- mushrooms
G('porcini', 'common', N.woodDry, 60, ['forest', 'alpine', 'maple', 'giant_woods']);
G('chanterelle', 'common', N.woodFloor, 50, ['forest', 'maple', 'plains', 'giant_woods']);
G('matsutake', 'rare', N.shadeSlope, 70, ['forest', 'alpine', 'giant_woods']);
G('morel', 'uncommon', N.woodEdge, 60, ['plains', 'maple', 'flower_fields', 'giant_woods']);
G('truffle', 'legendary', N.woodFloor, 90, ['forest', 'maple', 'plains']);
G('reishi', 'rare', N.woodFloor, 80, ['forest', 'bamboo_sea', 'karst_peaks']);
G('oyster_mushroom', 'common', N.woodFloor, 60, ['forest', 'maple', 'lakes', 'wetland', 'giant_mushrooms', 'bamboo_sea']);
G('lions_mane', 'uncommon', N.woodFloor, 80, ['forest', 'maple', 'giant_mushrooms']);
G('bamboo_fungus', 'uncommon', N.woodFloor, 50, ['bamboo_sea', 'terraces']);
G('glow_mushroom', 'rare', N.woodFloor, 50, ['forest', 'bamboo_sea', 'giant_mushrooms'], 2);
G('fly_agaric', 'uncommon', N.woodDry, 60, ['forest', 'alpine', 'maple', 'plains']);
G('death_cap', 'uncommon', N.woodFloor, 70, ['forest', 'maple', 'plains', 'lakes']);
// ---- fruit that grows low
G('cloudberry', 'rare', N.wetMeadow, 60, ['alpine', 'volcanic_tundra'], 2);
G('wild_tomato', 'common', N.field, 40, ['terraces', 'plains', 'vine_ruins', 'drowned_city']);
// ---- wild greens
G('dandelion', 'common', N.meadow, 50, ['plains', 'lakes', 'flower_fields', 'maple', 'terraces'], 1.5);
G('shepherds_purse', 'common', N.verge, 40, ['plains', 'terraces', 'karst_peaks', 'flower_fields']);
G('wild_scallion', 'common', N.meadow, 50, ['plains', 'lakes', 'maple', 'karst_peaks']);
G('watercress', 'common', N.shallows, 40, ['lakes', 'wetland', 'forest', 'karst_peaks', 'plains', 'drowned_city'], 6);
G('purslane', 'common', N.verge, 40, ['plains', 'desert', 'red_canyon', 'terraces']);
G('nettle', 'common', N.woodEdge, 50, ['forest', 'plains', 'lakes', 'maple', 'wetland']);
G('bamboo_shoot', 'common', { canopy: b(0.55, 1), moisture: b(0.45, 1) }, 40, ['bamboo_sea', 'terraces', 'karst_peaks'], 1.5);
G('samphire', 'uncommon', N.saltShore, 40, ['lakes', 'sea_cliffs', 'salt_lake', 'dry_seabed'], 3);
G('reindeer_moss', 'uncommon', N.rocky, 60, ['alpine', 'volcanic_tundra'], 2);
// ---- roots
G('wild_yam', 'uncommon', N.woodEdge, 60, ['karst_peaks', 'cherry_valley', 'bamboo_sea']);
G('lotus_root', 'common', N.shallows, 50, ['lakes', 'wetland', 'terraces'], 6);
G('burdock', 'common', N.verge, 50, ['plains', 'forest', 'maple', 'lakes', 'wetland']);
G('potato', 'common', N.field, 40, ['plains', 'terraces', 'flower_fields']);
G('ginseng', 'legendary', N.shadeSlope, 90, ['forest', 'alpine', 'maple', 'giant_woods']);
// ---- herbs and spices
G('coriander', 'common', N.field, 40, ['terraces', 'karst_peaks', 'vine_ruins']);
G('mint', 'common', N.bank, 40, ['plains', 'lakes', 'alpine', 'forest', 'wetland', 'bamboo_sea'], 2);
G('wild_garlic', 'common', N.woodFloor, 50, ['forest', 'maple', 'plains', 'giant_woods', 'bamboo_sea']);
G('chili', 'common', N.field, 40, ['terraces', 'desert', 'karst_peaks']);
G('perilla', 'common', N.field, 40, ['terraces', 'cherry_valley', 'bamboo_sea']);
G('thyme', 'common', N.rocky, 50, ['plains', 'maple', 'red_canyon', 'karst_peaks', 'desert']);
G('pine_needle', 'common', N.woodDry, 40, ['forest', 'alpine', 'red_canyon'], 1.5);
// ---- flowers
G('chamomile', 'common', N.meadow, 50, ['plains', 'flower_fields', 'lakes']);
G('wild_chrysanthemum', 'common', N.verge, 50, ['maple', 'plains', 'karst_peaks', 'terraces']);
// ---- medicinal plants
G('mugwort', 'common', N.verge, 50, ['plains', 'maple', 'lakes', 'cherry_valley', 'terraces', 'wetland']);
G('calendula', 'common', N.meadow, 50, ['flower_fields', 'plains', 'terraces']);
G('snow_lotus', 'legendary', N.highRock, 90, ['alpine', 'alpine_meadow'], 3);
G('cordyceps', 'legendary', N.highMeadow, 90, ['alpine', 'alpine_meadow'], 3);
G('echinacea', 'uncommon', N.meadow, 60, ['plains', 'flower_fields', 'alpine_meadow']);
// ---- waterside and shore
G('kelp', 'common', N.strand, 40, ['lakes', 'sea_cliffs'], 5);
G('clam', 'common', N.strand, 40, ['lakes', 'sea_cliffs'], 6);
G('mussel', 'common', N.seaRock, 40, ['lakes', 'sea_cliffs'], 6);
G('crab', 'uncommon', N.strand, 50, ['lakes', 'sea_cliffs'], 4);
G('water_chestnut', 'common', N.shallows, 50, ['lakes', 'wetland'], 6);
// ---- resources
G('flint', 'common', N.gravel, 60, ['red_canyon', 'desert', 'alpine', 'maple', 'crystal_waste']);
G('clay', 'common', N.bank, 60, ['plains', 'lakes', 'red_canyon', 'karst_peaks', 'terraces', 'crystal_waste', 'wetland']);
G('salt', 'common', N.saltShore, 50, ['desert', 'salt_lake', 'sea_cliffs', 'lakes', 'dry_seabed'], 2);
G('honeycomb', 'rare', N.woodEdge, 80, ['flower_fields', 'plains', 'savanna', 'floating_reefs'], 2);
G('sulphur', 'uncommon', N.rocky, 70, ['volcanic_tundra', 'desert']);
G('saltpetre', 'uncommon', N.rocky, 70, ['salt_lake', 'red_canyon', 'crystal_waste', 'karst_peaks']);

/** every row, for the tests and the developer's preview */
export const FORAGE_ROWS: readonly Row[] = ROWS;

/** a region's table with the ground forage that grows in it added to its ground rules (the rarest first, so that they are not crowded out) */
export function withForage(region: string, t: FloraTable): FloraTable {
  const add: FloraRule[] = [];
  for (const r of ROWS) {
    if (!r.regions.includes(region)) continue;
    // (the plant must exist: a row that names one that does not is a mistake in this file)
    plantDef(r.plant);
    add.push({ plant: r.plant, perHa: r.perHa, grove: r.grove, ...r.niche });
  }
  if (add.length === 0) return t;
  add.sort((x, y) => x.perHa - y.perHa);
  return { ...t, ground: [...add, ...t.ground] };
}

/** the regions a forage plant's row names (empty: no row) */
export function forageRegionsOf(plant: string): readonly string[] {
  return ROWS.find((r) => r.plant === plant)?.regions ?? [];
}
