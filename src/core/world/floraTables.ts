/**
 * What each region's country grows (docs/V3/nodes/W2-flora.md): the flora tables of the regions, by region id.
 * A table is data: how wooded and how wet the region is (the ecotope's parameters), which trees, shrubs and
 * ground plants stand where (rules: a plant, its numbers to the hectare, what it likes), and what covers the
 * ground between them. A region without a table of its own grows what its kin grows.
 *
 * To change what a region grows, change its rows here; to add a plant, add it to plants.ts first.
 */
import type { FloraTable } from './flora';

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
  plains: {
    eco: { wood: 0.3, woodScale: 380, clear: 11, edge: 26, treeline: null, thirsty: 0.5, moist: 0.42 },
    trees: [
      { plant: 'willow', perHa: 40, water: [0, 14], waterKinds: FRESH },
      { plant: 'oak', perHa: 110, canopy: [0.45, 1], grove: 120 },
      { plant: 'linden', perHa: 60, canopy: [0.45, 1] },
      { plant: 'birch', perHa: 50, canopy: [0.3, 1], moisture: [0.35, 0.8] },
      { plant: 'apple_tree', perHa: 5, canopy: [0.1, 0.5], road: [12, 120] },
      { plant: 'poplar', perHa: 6, canopy: [0, 0.3], size: [0.9, 1.3] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 420, water: [0, 5], waterKinds: FRESH },
      { plant: 'hazel', perHa: 30, canopy: [0.3, 0.7] },
      { plant: 'bush', perHa: 60, canopy: [0.15, 0.6] },
      { plant: 'berry_bush', perHa: 14, canopy: [0.1, 0.5], moisture: [0.3, 0.7], grove: 70 },
      { plant: 'rose_bush', perHa: 8, canopy: [0, 0.35] },
    ],
    ground: [
      { plant: 'log', perHa: 10, canopy: [0.5, 1] },
      { plant: 'flower_clump', perHa: 30, canopy: [0, 0.3], moisture: [0.3, 0.8] },
      { plant: 'rock', perHa: 6 },
    ],
    cover: { grass: 0.95, height: 0.45, flowers: 0.12, hues: [WHITE, YELLOW, VIOLET], bare: 0 },
  },
  // dry country: almost bare, scrub in drifts, cactus on the flats, a green line along any water
  desert: {
    eco: { wood: 0.04, woodScale: 300, clear: 14, edge: 30, treeline: null, thirsty: 0.75, moist: 0.08 },
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
      { plant: 'birch', perHa: 20, canopy: [0.2, 0.6], relief: [-50, 80] },
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
  lakes: {
    eco: { wood: 0.26, woodScale: 380, clear: 12, edge: 26, treeline: null, thirsty: 0.6, moist: 0.5 },
    trees: [
      { plant: 'willow', perHa: 70, water: [0, 18] },
      { plant: 'oak', perHa: 70, canopy: [0.45, 1] },
      { plant: 'birch', perHa: 60, canopy: [0.35, 1] },
      { plant: 'linden', perHa: 30, canopy: [0.45, 1] },
      { plant: 'poplar', perHa: 20, canopy: [0.2, 0.8] },
    ],
    shrubs: [
      { plant: 'reed', perHa: 700, water: [0, 6] },
      { plant: 'cranberry_bush', perHa: 30, moisture: [0.75, 1], water: [0, 30], grove: 50 },
      { plant: 'bush', perHa: 50, canopy: [0.15, 0.6] },
      { plant: 'berry_bush', perHa: 10, canopy: [0.1, 0.5] },
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
      { plant: 'chestnut_tree', perHa: 16, canopy: [0.3, 0.9], grove: 80 },
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
    ],
    ground: [
      { plant: 'log', perHa: 16, canopy: [0.5, 1] },
      { plant: 'rock', perHa: 8 },
      { plant: 'stump', perHa: 6, canopy: [0.4, 1] },
    ],
    cover: { grass: 0.8, height: 0.35, flowers: 0.04, hues: [YELLOW, RED], bare: 0.02 },
  },
};

/** the table of a region: its own, else its kin's */
export function floraTableOf(id: string, kin: string): FloraTable {
  return FLORA[id] ?? FLORA[kin] ?? FLORA.plains;
}
