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
 * To make a kind grow somewhere else, add the region's id to its row (or give it a second row, where it
 * grows in another kind of spot there); to add a kind, add its plant to plants.ts and a row here.
 */
import type { Band, FloraRule, FloraTable } from './flora';
import { ROAD_FOODS, ROAD_LIFE, type RoadLife } from './data/ecoFauna';
import { routeProfileId } from './routeProfiles';
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
  /** open grass, neither dry nor wet */
  meadow: { canopy: b(0, 0.2), moisture: b(0.3, 0.8) },
  /** open wet ground */
  wetMeadow: { canopy: b(0, 0.35), moisture: b(0.7, 1) },
  /** open ground that is damp rather than wet: the hollows and shaded sides of the high country */
  dampOpen: { canopy: b(0, 0.35), moisture: b(0.5, 1) },
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
G('porcini', 'common', N.woodDry, 60, ['forest']);
G('chanterelle', 'common', N.woodFloor, 50, ['forest', 'maple', 'plains']);
G('morel', 'uncommon', N.woodEdge, 60, ['plains', 'maple']);
G('pine_needle', 'common', N.woodDry, 40, ['alpine', 'forest'], 2);
G('fly_agaric', 'uncommon', N.woodDry, 60, ['forest']);

// ---- wild greens
G('dandelion', 'common', N.meadow, 50, ['plains', 'maple', 'flower_fields'], 1.5);
G('shepherds_purse', 'common', N.verge, 40, ['plains', 'terraces', 'karst_peaks']);
G('watercress', 'common', N.shallows, 40, ['lakes', 'wetland', 'forest', 'plains'], 6);
G('purslane', 'common', N.verge, 40, ['plains', 'desert']);
G('nettle', 'common', N.woodEdge, 50, ['forest', 'plains', 'maple']);
G('bamboo_shoot', 'common', { canopy: b(0.55, 1), moisture: b(0.45, 1) }, 40, ['bamboo_sea', 'karst_peaks'], 1.5);
// ---- roots
G('lotus_root', 'common', { ...N.field, ...N.shallows }, 50, ['terraces'], 6);
G('burdock', 'common', N.verge, 50, ['plains', 'forest', 'maple']);
G('potato', 'common', N.field, 40, ['plains']);
// ---- herbs and spices
G('coriander', 'common', N.field, 40, ['terraces', 'karst_peaks']);
G('mint', 'common', N.bank, 40, ['plains', 'forest', 'alpine'], 2);
G('chili', 'common', N.field, 40, ['terraces', 'karst_peaks']);
G('perilla', 'common', N.field, 40, ['terraces', 'bamboo_sea']);
// ---- flowers
G('chamomile', 'common', N.field, 50, ['plains']);


// ---- waterside and shore
G('kelp', 'common', N.seaRock, 40, ['lakes'], 5);
G('clam', 'common', N.strand, 40, ['lakes'], 6);
G('mussel', 'common', N.seaRock, 40, ['lakes'], 6);
G('crab', 'uncommon', N.strand, 50, ['lakes'], 4);
// ---- resources
G('clay', 'common', N.bank, 60, ['plains', 'lakes', 'red_canyon', 'karst_peaks', 'terraces', 'wetland']);
G('honeycomb', 'rare', N.woodEdge, 80, ['plains', 'flower_fields'], 2);

/** every row, for the tests and the developer's preview */
export const FORAGE_ROWS: readonly Row[] = ROWS;

/** Regional records supply the food identity; the corresponding rule supplies its host or microsite. */
const FOOD_PLANTS: Readonly<Record<string, FloraRule>> = {
  acorn: { plant: 'oak', perHa: 5, ...N.woodEdge },
  hazelnut: { plant: 'european_hazel', perHa: 7, ...N.woodEdge },
  saguaro_fruit: { plant: 'saguaro', perHa: 9, ...N.dryOpen },
  pine_nut: { plant: 'pinyon', perHa: 8, relief: b(10, 180), moisture: b(0, 0.4) },
  cactus_fruit: { plant: 'prickly_pear', perHa: 12, ...N.dryOpen },
  wild_berry: { plant: 'berry_bush', perHa: 9, ...N.woodEdge },
  blueberry: { plant: 'blueberry_bush', perHa: 8, ...N.dampOpen },
  cloudberry: { plant: 'cloudberry_plant', perHa: 4, ...N.wetMeadow },
  rose_hip: { plant: 'rose_bush', perHa: 5, ...N.woodEdge },
  walnut: { plant: 'walnut_tree', perHa: 3, ...N.woodEdge },
  chestnut: { plant: 'chestnut_tree', perHa: 5, ...N.woodEdge },
  porcini: { plant: 'porcini_plant', perHa: 3, ...N.woodFloor },
  morel: { plant: 'morel_plant', perHa: 3, ...N.woodEdge },
  wild_garlic: { plant: 'wild_garlic_plant', perHa: 4, ...N.woodFloor },
  bamboo_shoot: { plant: 'bamboo_shoot_plant', perHa: 6, canopy: b(0.55, 1), moisture: b(0.45, 1) },
  shepherds_purse: { plant: 'shepherds_purse_plant', perHa: 5, ...N.verge },
  kelp: { plant: 'kelp_plant', perHa: 4, ...N.seaRock },
  evergreen_huckleberry: { plant: 'evergreen_huckleberry_bush', perHa: 6, ...N.woodEdge },
  bilberry: { plant: 'bilberry_bush', perHa: 6, ...N.dampOpen },
  lingonberry: { plant: 'lingonberry_bush', perHa: 6, ...N.dampOpen },
  calafate: { plant: 'calafate_bush', perHa: 6, ...N.woodEdge },
  native_raspberry: { plant: 'native_raspberry_bush', perHa: 6, ...N.woodEdge },
  serviceberry: { plant: 'serviceberry_bush', perHa: 6, ...N.woodEdge },
};

// The legacy authored landscapes have additional documented native, naturalised or farm species.
// Geography alone cannot place a plant: these only retain existing rules (including their site constraints).
const LOCAL: Readonly<Record<string, readonly string[]>> = {
  plains: ['acorn', 'wild_apple', 'rose_hip', 'reed'],
  forest: ['resin', 'reed'],
  maple: ['acorn', 'wild_grape', 'persimmon', 'rose_hip', 'walnut'],
  flower_fields: ['rose_hip', 'reed'],
  alpine: ['resin'],
  red_canyon: ['fibre_grass', 'reed'],
  desert: ['agave_heart', 'fibre_grass', 'reed'],
  lakes: ['wild_berry', 'reed'],
  wetland: ['reed'],
  terraces: ['tea_leaf', 'bamboo_cane', 'reed'],
  karst_peaks: ['bamboo_cane', 'sichuan_pepper', 'reed'],
  bamboo_sea: ['bamboo_cane', 'reed'],
};

export function withForage(region: string, table: FloraTable): FloraTable {
  const profileId = routeProfileId(region);
  const profile: RoadLife | undefined = (ROAD_LIFE as Readonly<Partial<Record<string, RoadLife>>>)[profileId];
  const allowed = new Set(LOCAL[region]);
  const extra: FloraRule[] = [];
  for (const food of profile?.foods ?? []) {
    const id = ROAD_FOODS[food].forageId;
    if (id === null) continue;
    allowed.add(id);
    const rule = FOOD_PLANTS[id];
    if (rule) extra.push(rule);
  }
  if (profile) {
    if (profile.crops.includes('cherryNo')) extra.push({ plant: 'cherry_tree', perHa: 6, ...N.field });
    if (profile.crops.includes('appleNo') || profile.crops.includes('appleAlp')) extra.push({ plant: 'apple_tree', perHa: 6, ...N.field });
    if (profile.crops.includes('potatoNo')) extra.push({ plant: 'potato_plant', perHa: 9, ...N.field });
    if (profile.crops.some(crop => crop === 'riceH' || crop === 'riceI' || crop === 'riceG')) {
      allowed.add('wild_rice'); // Inventory id predates the cultivated-rice correction.
      extra.push({ plant: 'rice_stand', perHa: 220, ...N.field, moisture: b(0.5, 1), water: b(0, 2), waterKinds: FRESH });
    }
  }

  const additions = ROWS.filter(row => row.regions.includes(region)).map(row => ({
    plant: row.plant, perHa: row.perHa, grove: row.grove, ...row.niche,
  }));
  for (const rule of additions) allowed.add(plantDef(rule.plant).bears!.forage);
  additions.sort((a, b) => a.perHa - b.perHa);
  function layer(base: readonly FloraRule[], name: 'tree' | 'shrub' | 'ground'): FloraRule[] {
    const rules = base.filter(rule => {
      const item = plantDef(rule.plant).bears?.forage;
      return !item || allowed.has(item);
    });
    for (const rule of extra) {
      if (plantDef(rule.plant).layer === name && !rules.some(r => r.plant === rule.plant)) rules.push(rule);
    }
    return rules;
  }
  return { ...table, trees: layer(table.trees, 'tree'), shrubs: layer(table.shrubs, 'shrub'),
    ground: layer([...additions, ...table.ground], 'ground') };
}
/** the regions a forage plant's rows name (empty: no row; a plant may have a row for each kind of spot it grows in) */
export function forageRegionsOf(plant: string): readonly string[] {
  return [...new Set(ROWS.filter((r) => r.plant === plant).flatMap((r) => r.regions))];
}
