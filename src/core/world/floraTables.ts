/**
 * What each region's country grows (docs/V3/nodes/W2-flora.md): the flora tables of the regions, by region id.
 * A table is data: how wooded and how wet the region is (the ecotope's parameters), which trees, shrubs and
 * ground plants stand where (rules: a plant, its numbers to the hectare, what it likes), and what covers the
 * ground between them. A region without a table of its own grows what its kin grows.
 *
 * To change what a region grows, change its rows here; to add a plant, add it to plants.ts first.
 *
 * (A number to the hectare above 156 for a tree or a shrub, 625 for a ground plant, means "every cell where
 * it suits": a layer's grid holds one plant to a cell. Reeds are written so: a reed to every 8 m cell of the
 * bank, which whoever draws them makes a bed of by drawing each several metres wide.)
 *
 * What each region comes to — the share of its land under wood, its trees to the hectare, its kinds, what
 * there is to pick — is held in bands by harness/sim/v3_flora_regions.test.ts: change a row, run it.
 */
import type { FloraTable } from './flora';
import { withForage } from './floraForage';

const LAKE = 1;
const RIVER = 2;
const FRESH = LAKE | RIVER;

const WHITE = 0xf4f0e6;
const YELLOW = 0xf2c84b;
const VIOLET = 0x9a7fd0;
const PINK = 0xe89ab0;
const RED = 0xd8483a;
const BLUE = 0x6f8fd8;

export const FLORA: Record<string, FloraTable> = {
  // rolling grassland: copses and hedges, meadow between, willows and reeds by the water
  // (laid out as a painter lays out a valley: woods in copses with open meadow between and kept back from the
  // road, smaller trees where a copse thins, now and then a great oak alone in the grass, hedges wandering
  // across the meadow with gaps in them, poplars along the water)
  plains: {
    eco: { wood: 0.3, woodScale: 210, clear: 16, edge: 60, treeline: null, thirsty: 0.45, moist: 0.42 },
    trees: [
      { plant: 'willow', perHa: 40, water: [0, 14], waterKinds: FRESH },
      { plant: 'oak', perHa: 110, canopy: [0.45, 1], grove: 120 },
      { plant: 'linden', perHa: 60, canopy: [0.45, 1] },
      { plant: 'birch', perHa: 50, canopy: [0.3, 1], moisture: [0.35, 0.8] },
      { plant: 'oak', perHa: 22, canopy: [0.15, 0.45], size: [0.6, 0.9] },
      { plant: 'oak', perHa: 0.35, canopy: [0, 0.06], road: [30, 4000], size: [1.2, 1.45] },
      { plant: 'linden', perHa: 0.15, canopy: [0, 0.06], road: [30, 4000], size: [1.15, 1.4] },
      { plant: 'oak', perHa: 14, canopy: [0, 0.3], road: [20, 4000], hedge: 150, size: [0.85, 1.25] },
      { plant: 'apple_tree', perHa: 5, canopy: [0.1, 0.5], road: [12, 120] },
      { plant: 'poplar', perHa: 10, water: [0, 30], waterKinds: FRESH, canopy: [0, 0.5], size: [0.9, 1.3] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 420, water: [0, 5], waterKinds: FRESH },
      { plant: 'hazel', perHa: 30, canopy: [0.3, 0.7] },
      { plant: 'bush', perHa: 60, canopy: [0.15, 0.6] },
      { plant: 'bush', perHa: 200, canopy: [0, 0.3], road: [14, 4000], hedge: 150, size: [1, 1.45] },
      { plant: 'hazel', perHa: 70, canopy: [0, 0.3], road: [14, 4000], hedge: 150, size: [0.9, 1.3] },
      { plant: 'berry_bush', perHa: 14, canopy: [0.1, 0.5], moisture: [0.3, 0.7], grove: 70 },
      { plant: 'rose_bush', perHa: 8, canopy: [0, 0.35] },
      { plant: 'fibre_tuft', perHa: 14, canopy: [0, 0.2], moisture: [0.1, 0.45], grove: 60 },
    ],
    ground: [
      { plant: 'log', perHa: 10, canopy: [0.5, 1] },
      { plant: 'flower_clump', perHa: 30, canopy: [0, 0.3], moisture: [0.3, 0.8] },
      { plant: 'rock', perHa: 6 },
    ],
    cover: { grass: 0.95, height: 0.45, flowers: 0.12, hues: [WHITE, YELLOW, VIOLET], bare: 0 },
  },
  // dry country: almost bare, scrub in drifts, cactus on the flats, a green line along any water
  // (no woods of its own: `wood` 0; its only canopy is the bank's)
  desert: {
    eco: { wood: 0, woodScale: 300, clear: 14, edge: 30, treeline: null, thirsty: 0.75, moist: 0.08 },
    trees: [
      { plant: 'poplar', perHa: 50, water: [0, 25], waterKinds: FRESH },
      { plant: 'saguaro', perHa: 8, moisture: [0, 0.3], slope: [0, 0.25], grove: 200 },
      { plant: 'juniper', perHa: 4, relief: [10, 200] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 200, water: [0, 4], waterKinds: FRESH },
      { plant: 'sage_bush', perHa: 70, moisture: [0, 0.35], grove: 90 },
      { plant: 'prickly_pear', perHa: 26, moisture: [0, 0.3] },
      { plant: 'agave', perHa: 12, slope: [0.05, 0.5] },
      { plant: 'fibre_tuft', perHa: 14, moisture: [0, 0.35], grove: 70 },
    ],
    ground: [
      { plant: 'rock', perHa: 30 },
      { plant: 'boulder', perHa: 6 },
    ],
    cover: { grass: 0.12, height: 0.25, flowers: 0.01, hues: [YELLOW], bare: 0.75 },
  },
  // the snowy conifer mountains: spruce and pine to the tree line, rock above
  alpine: {
    eco: { wood: 0.5, woodScale: 300, clear: 10, edge: 20, treeline: [110, 210], thirsty: 0.2, moist: 0.45 },
    trees: [
      { plant: 'spruce', perHa: 150, canopy: [0.4, 1], grove: 150 },
      { plant: 'pine', perHa: 60, canopy: [0.3, 1] },
      { plant: 'juniper', perHa: 20, canopy: [0.2, 0.6], size: [0.35, 0.7] },
    ],
    shrubs: [
      { plant: 'blueberry_bush', perHa: 30, canopy: [0.3, 0.8] },
      { plant: 'bush', perHa: 30, canopy: [0.1, 0.6] },
    ],
    ground: [
      { plant: 'rock', perHa: 40, slope: [0.2, 2] },
      { plant: 'boulder', perHa: 10 },
    ],
    cover: { grass: 0.25, height: 0.2, flowers: 0, hues: [], bare: 0.3 },
  },
  // the forest: wood nearly everywhere, conifers on the shaded sides, ferns and blueberries under them
  forest: {
    eco: { wood: 0.82, woodScale: 420, clear: 9, edge: 16, treeline: null, thirsty: 0.3, moist: 0.55 },
    trees: [
      { plant: 'willow', perHa: 30, water: [0, 12], waterKinds: FRESH },
      { plant: 'spruce', perHa: 120, canopy: [0.5, 1], shade: [0.4, 1], grove: 160 },
      { plant: 'pine', perHa: 90, canopy: [0.4, 1], moisture: [0.2, 0.6], grove: 140 },
      { plant: 'oak', perHa: 70, canopy: [0.4, 1] },
      { plant: 'birch', perHa: 60, canopy: [0.3, 0.9], moisture: [0.4, 0.9] },
      { plant: 'linden', perHa: 40, canopy: [0.4, 1] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 300, water: [0, 5], waterKinds: FRESH },
      { plant: 'fern', perHa: 120, canopy: [0.6, 1], moisture: [0.5, 1] },
      { plant: 'blueberry_bush', perHa: 60, canopy: [0.4, 0.9], moisture: [0.4, 0.8], grove: 60 },
      { plant: 'hazel', perHa: 30, canopy: [0.3, 0.7] },
      { plant: 'bush', perHa: 40, canopy: [0.2, 0.7] },
    ],
    ground: [
      { plant: 'log', perHa: 30, canopy: [0.6, 1] },
      { plant: 'stump', perHa: 10, canopy: [0.5, 1] },
      { plant: 'rock', perHa: 8 },
      { plant: 'boulder', perHa: 2 },
    ],
    cover: { grass: 0.7, height: 0.35, flowers: 0.05, hues: [WHITE, BLUE], bare: 0 },
  },
  // lake country: open meadow down to the water, willows and reed beds on the shores, copses behind
  // (the shores of its lakes and rivers: its sea's beach is sand, with what floraForage.ts puts on a strand)
  lakes: {
    eco: { wood: 0.26, woodScale: 380, clear: 12, edge: 26, treeline: null, thirsty: 0.6, moist: 0.5 },
    trees: [
      { plant: 'willow', perHa: 70, water: [0, 18], waterKinds: FRESH },
      { plant: 'southern_beech', perHa: 70, canopy: [0.45, 1] },
      { plant: 'birch', perHa: 60, canopy: [0.35, 1] },
      { plant: 'linden', perHa: 30, canopy: [0.45, 1] },
      { plant: 'poplar', perHa: 20, canopy: [0.2, 0.8] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 700, water: [0, 6], waterKinds: FRESH },
      { plant: 'bush', perHa: 50, canopy: [0.15, 0.6] },
      { plant: 'berry_bush', perHa: 10, road: [12, 45], canopy: [0.1, 0.5] },
    ],
    ground: [
      { plant: 'flower_clump', perHa: 30, canopy: [0, 0.3] },
      { plant: 'log', perHa: 6, canopy: [0.5, 1] },
      { plant: 'rock', perHa: 5 },
    ],
    cover: { grass: 0.95, height: 0.5, flowers: 0.1, hues: [WHITE, YELLOW, PINK], bare: 0 },
  },
  // the maple hills: red woods on most slopes, chestnuts and walnuts among them, persimmons by the lanes
  maple: {
    eco: { wood: 0.6, woodScale: 340, clear: 10, edge: 22, treeline: null, thirsty: 0.3, moist: 0.45 },
    trees: [
      { plant: 'maple', perHa: 140, canopy: [0.4, 1], grove: 130 },
      { plant: 'walnut_tree', perHa: 10, canopy: [0.2, 0.7] },
      { plant: 'persimmon_tree', perHa: 6, canopy: [0.05, 0.45], road: [12, 150] },
      { plant: 'oak', perHa: 40, canopy: [0.4, 1] },
      { plant: 'birch', perHa: 30, canopy: [0.3, 1] },
    ],
    shrubs: [
      { plant: 'fern', perHa: 40, canopy: [0.6, 1], moisture: [0.5, 1] },
      { plant: 'hazel', perHa: 30, canopy: [0.3, 0.7] },
      { plant: 'bush', perHa: 50, canopy: [0.15, 0.6] },
      { plant: 'rose_bush', perHa: 8, canopy: [0, 0.35] },
      { plant: 'grape_vine', perHa: 8, canopy: [0.15, 0.5], shade: [0, 0.45] },
    ],
    ground: [
      { plant: 'log', perHa: 16, canopy: [0.5, 1] },
      { plant: 'rock', perHa: 8 },
      { plant: 'stump', perHa: 6, canopy: [0.4, 1] },
    ],
    cover: { grass: 0.8, height: 0.35, flowers: 0.04, hues: [YELLOW, RED], bare: 0.02 },
  },
  // the flower fields: open rolling land in long rows of colour, shelter belts of poplar, hives at the field corners
  flower_fields: {
    eco: { wood: 0.1, woodScale: 420, clear: 14, edge: 30, treeline: null, thirsty: 0.45, moist: 0.45 },
    trees: [
      { plant: 'willow', perHa: 40, water: [0, 14], waterKinds: FRESH },
      { plant: 'poplar', perHa: 60, canopy: [0.35, 1], size: [0.9, 1.3] },
      { plant: 'linden', perHa: 50, canopy: [0.4, 1] },
      { plant: 'cherry_tree', perHa: 4, canopy: [0.05, 0.4], road: [12, 140] },
      { plant: 'apple_tree', perHa: 4, canopy: [0.05, 0.4], road: [12, 140] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 300, water: [0, 5], waterKinds: FRESH },
      { plant: 'sunflower', perHa: 90, canopy: [0, 0.1], slope: [0, 0.1], grove: 70 },
      { plant: 'rose_bush', perHa: 16, canopy: [0, 0.35] },
      { plant: 'bush', perHa: 24, canopy: [0.2, 0.6] },
    ],
    ground: [{ plant: 'rock', perHa: 3 }],
    cover: { grass: 0.9, height: 0.4, flowers: 0.85, hues: [VIOLET, YELLOW, PINK, WHITE, RED], rows: { spacing: 7, share: 0.62, maxSlope: 0.16 }, bare: 0 },
  },
  // terraced hill farms: tea in rows on the benches, crops gone wild, persimmons and camphor by the lanes, bamboo in the gullies
  // (tea twice: on the benches of the terraced hillsides (`bench`), and on ground the ecotope's slope calls
  // level; bamboo before camphor, so that where its grove is thick the wood is bamboo and nothing else)
  terraces: {
    eco: { wood: 0.22, woodScale: 300, clear: 10, edge: 22, treeline: [160, 260], thirsty: 0.4, moist: 0.55 },
    trees: [
      { plant: 'willow', perHa: 30, water: [0, 12], waterKinds: FRESH },
      { plant: 'bamboo', perHa: 120, canopy: [0.45, 1], moisture: [0.5, 1], grove: 90 },
      { plant: 'camphor', perHa: 70, canopy: [0.4, 1] },
      { plant: 'persimmon_tree', perHa: 8, canopy: [0.05, 0.45], road: [10, 160] },
      { plant: 'pepper_tree', perHa: 5, canopy: [0.1, 0.5], shade: [0, 0.5] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 260, water: [0, 5], waterKinds: FRESH },
      { plant: 'tea_bush', perHa: 420, canopy: [0, 0.2], bench: true, relief: [8, 200], grove: 110 },
      { plant: 'tea_bush', perHa: 420, canopy: [0, 0.2], slope: [0, 0.07], relief: [8, 200], grove: 110 },
      { plant: 'bush', perHa: 30, canopy: [0.2, 0.6] },
      { plant: 'fern', perHa: 40, canopy: [0.5, 1], moisture: [0.5, 1] },
    ],
    ground: [
      { plant: 'rock', perHa: 5 },
      { plant: 'log', perHa: 6, canopy: [0.5, 1] },
    ],
    cover: { grass: 0.85, height: 0.4, flowers: 0.22, hues: [0xcfd86a, 0xa9cf5a, YELLOW], rows: { spacing: 2.6, share: 0.7, maxSlope: 0.07 }, bare: 0.02 },
  },
  // marsh: reed beds and wet meadow as far as one sees, willows on the hummocks, cranberries on the wet ground
  wetland: {
    eco: { wood: 0.12, woodScale: 320, clear: 12, edge: 26, treeline: null, thirsty: 0.7, moist: 0.72 },
    trees: [
      { plant: 'willow', perHa: 90, water: [0, 22] },
      { plant: 'birch', perHa: 50, canopy: [0.35, 1] },
      { plant: 'poplar', perHa: 20, canopy: [0.3, 1] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 1100, water: [0, 9] },
      { plant: 'bush', perHa: 30, canopy: [0.2, 0.7] },
    ],
    ground: [
      { plant: 'log', perHa: 8 },
      { plant: 'stump', perHa: 4 },
    ],
    cover: { grass: 0.9, height: 0.6, flowers: 0.06, hues: [WHITE, VIOLET], bare: 0 },
  },
  // the bamboo sea: groves that close over the road on the valley sides, camphor and tea where they open
  bamboo_sea: {
    eco: { wood: 0.8, woodScale: 360, clear: 8, edge: 12, treeline: null, thirsty: 0.3, moist: 0.6 },
    trees: [
      { plant: 'bamboo', perHa: 150, canopy: [0.35, 1], grove: 200 },
      { plant: 'camphor', perHa: 40, canopy: [0.4, 1] },
      { plant: 'willow', perHa: 30, water: [0, 12], waterKinds: FRESH },
      { plant: 'linden', perHa: 20, canopy: [0.4, 1] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 260, water: [0, 5], waterKinds: FRESH },
      { plant: 'fern', perHa: 110, canopy: [0.55, 1], moisture: [0.45, 1] },
      { plant: 'bush', perHa: 60, canopy: [0.05, 0.4], slope: [0, 0.2], grove: 80 },
      { plant: 'bush', perHa: 30, canopy: [0.15, 0.6] },
    ],
    ground: [
      { plant: 'log', perHa: 10, canopy: [0.5, 1] },
      { plant: 'rock', perHa: 8 },
      { plant: 'boulder', perHa: 2 },
    ],
    cover: { grass: 0.6, height: 0.3, flowers: 0.03, hues: [WHITE], bare: 0.03 },
  },
  // red rock canyon country: bare stone and sand, juniper on the benches, sage flats, a green thread along the river
  // (no woods of its own either: the junipers and the odd pine stand apart, by relief and slope)
  red_canyon: {
    eco: { wood: 0, woodScale: 260, clear: 14, edge: 30, treeline: null, thirsty: 0.8, moist: 0.1 },
    trees: [
      { plant: 'poplar', perHa: 60, water: [0, 22], waterKinds: FRESH },
      { plant: 'juniper', perHa: 16, relief: [6, 260], slope: [0, 0.5], grove: 160 },
      { plant: 'pine', perHa: 1.5, relief: [30, 300], slope: [0, 0.5] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 200, water: [0, 4], waterKinds: FRESH },
      { plant: 'sage_bush', perHa: 90, moisture: [0, 0.4], slope: [0, 0.3], grove: 90 },
      { plant: 'prickly_pear', perHa: 30, moisture: [0, 0.3] },
      { plant: 'agave', perHa: 10, slope: [0.08, 0.6] },
      { plant: 'fibre_tuft', perHa: 30, moisture: [0, 0.4], grove: 70 },
    ],
    ground: [
      { plant: 'rock', perHa: 40 },
      { plant: 'boulder', perHa: 12 },
    ],
    cover: { grass: 0.1, height: 0.22, flowers: 0.01, hues: [YELLOW], bare: 0.8 },
  },
  // karst: a flat green valley floor of fields and river bends between the towers, the towers themselves hung with scrub
  // (scrub on a tower's gentler ground by `landform`; nothing of the slopes' own on ground steeper than 1 in 1:
  // a tower's sides are rock)
  karst_peaks: {
    eco: { wood: 0.34, woodScale: 240, clear: 11, edge: 22, treeline: null, thirsty: 0.55, moist: 0.6 },
    trees: [
      { plant: 'willow', perHa: 50, water: [0, 16], waterKinds: FRESH },
      { plant: 'bamboo', perHa: 90, water: [4, 60], canopy: [0.2, 1], grove: 120 },
      { plant: 'camphor', perHa: 80, canopy: [0.4, 1] },
      { plant: 'pepper_tree', perHa: 8, canopy: [0.1, 0.55], slope: [0.05, 0.8] },
      { plant: 'linden', perHa: 30, canopy: [0.4, 1], slope: [0.2, 1] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 320, water: [0, 5], waterKinds: FRESH },
      { plant: 'bush', perHa: 50, canopy: [0, 0.35], slope: [0.04, 0.3], grove: 80 },
      { plant: 'fern', perHa: 60, canopy: [0.5, 1] },
      { plant: 'bush', perHa: 110, landform: [8, 500], slope: [0, 0.9] },
      { plant: 'bush', perHa: 50, slope: [0.3, 1] },
      { plant: 'grape_vine', perHa: 10, slope: [0.15, 1], shade: [0, 0.45] },
    ],
    ground: [
      { plant: 'rock', perHa: 14, slope: [0.2, 2] },
      { plant: 'boulder', perHa: 4 },
      { plant: 'log', perHa: 5, canopy: [0.5, 1] },
    ],
    cover: { grass: 0.9, height: 0.45, flowers: 0.08, hues: [YELLOW, WHITE, VIOLET], bare: 0.01 },
  },
};

/** the table of a region: its own, else its kin's; with what is foraged from the ground grown into it (floraForage.ts) */
export function floraTableOf(id: string, kin: string): FloraTable {
  const own = FLORA[id] ? id : FLORA[kin] ? kin : 'plains';
  const key = own + '/' + id;
  let t = GROWN.get(key);
  if (!t) {
    t = withForage(id, FLORA[own]);
    GROWN.set(key, t);
  }
  return t;
}

const GROWN = new Map<string, FloraTable>();
