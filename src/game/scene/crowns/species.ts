/**
 * The kinds of tree the game grows as painted crowns (scene/crowns/grow.ts), by the model family the plant
 * catalogue names (core/world/plants.ts `PlantDef.model`): their shapes, two of each so that a wood is not one
 * tree over and over, each grown at the three levels of detail. A family without a row here is drawn as it was
 * (the plants' atlas, scene/plantRegistry.ts); so is every family far off, past the levels here.
 *
 * To give a family painted crowns: add its shapes to SPECIES. The numbers are the tree's own (m) at the size the
 * grower builds it; a plant of it is set at its catalogue height (crowns.ts `scaleOf`).
 *
 * Built on first asking (a world of version 1 never asks), DOM-free.
 */
import { CROWN_LEVELS, growBroadleaf, growConifer, type BroadleafShape, type ConiferShape, type CrownModel } from './grow';

import { growSpecial, type Special } from './special';
import { floraKind, growFlora } from '../flora/catalog';
import { mulberry } from '../vegetation';

export type SpeciesShape = { kind: 'broadleaf'; shape: BroadleafShape } | { kind: 'conifer'; shape: ConiferShape } | { kind: 'special'; form: Special };

/** a family's shapes and how it is drawn as a crown */
export interface SpeciesDef {
  /** its variants (seed and shape) */
  variants: readonly { seed: number; grow: SpeciesShape }[];
  /** what its bark is painted with: its own dark wood, or the plant's second colour (a birch's white) */
  bark: 'wood' | 'accent';
  /** how much it gives to the wind (1 a broad-leaved tree) */
  sway: number;
  /** a shrub: nearer levels end sooner */
  small?: boolean;
}

const oakA: BroadleafShape = { trunk: 2.2, girth: 0.5, crown: 6.6, rise: 7.2, limbs: 5, clump: 2.1, fill: 8, cards: 42, spray: 1.2 };
const oakB: BroadleafShape = { trunk: 2.6, girth: 0.42, crown: 5.6, rise: 8.2, limbs: 4, clump: 1.9, fill: 9, cards: 42, spray: 1.2 };
const lindenA: BroadleafShape = { trunk: 3.3, girth: 0.36, crown: 4.6, rise: 9.6, limbs: 4, clump: 1.7, fill: 10, cards: 40, spray: 1.15 };
const lindenB: BroadleafShape = { trunk: 3.0, girth: 0.4, crown: 5.0, rise: 9.0, limbs: 5, clump: 1.8, fill: 9, cards: 40, spray: 1.15, lopsided: 0.6 };
const wideA: BroadleafShape = { trunk: 1.9, girth: 0.55, crown: 7.0, rise: 6.4, limbs: 6, clump: 2.2, fill: 8, cards: 27, spray: 1.25, lopsided: 1.2 };
const birchA: BroadleafShape = { trunk: 3.2, girth: 0.2, crown: 2.7, rise: 8.4, limbs: 6, clump: 1.15, fill: 8, cards: 28, spray: 0.8, upright: 0.7, weep: 0.3, lopsided: 0.6 };
const birchB: BroadleafShape = { trunk: 3.6, girth: 0.18, crown: 2.4, rise: 9.0, limbs: 6, clump: 1.05, fill: 8, cards: 26, spray: 0.78, upright: 0.8, weep: 0.4, lopsided: 0.8 };
const poplarA: BroadleafShape = { trunk: 1.8, girth: 0.3, crown: 1.9, rise: 12.5, limbs: 7, clump: 1.2, fill: 12, cards: 26, spray: 0.9, upright: 1, lopsided: 0.35 };
const poplarB: BroadleafShape = { trunk: 2.2, girth: 0.32, crown: 2.2, rise: 11.5, limbs: 7, clump: 1.25, fill: 11, cards: 26, spray: 0.9, upright: 0.9, lopsided: 0.5 };
const spruceA: ConiferShape = { height: 14, base: 0.06, radius: 2.9, tiers: 12, branches: 5, droop: 0.6, clump: 1.05, cards: 16, spray: 0.95, girth: 0.33, taper: 1.05, ragged: 0.3 };
const spruceB: ConiferShape = { height: 15, base: 0.1, radius: 2.6, tiers: 13, branches: 5, droop: 0.7, clump: 1.0, cards: 16, spray: 0.92, girth: 0.32, taper: 1.15, ragged: 0.4 };
const pineA: ConiferShape = { height: 13, base: 0.38, radius: 3.0, tiers: 9, branches: 5, droop: 0.12, clump: 1.4, cards: 24, spray: 1.05, girth: 0.32, taper: 0.55, ragged: 0.65, clouds: 0.6 };
const pineB: ConiferShape = { height: 12, base: 0.3, radius: 2.8, tiers: 10, branches: 5, droop: 0.2, clump: 1.3, cards: 22, spray: 1.05, girth: 0.3, taper: 0.7, ragged: 0.55, clouds: 0.45 };
const bushA: BroadleafShape = { trunk: 0.25, girth: 0.07, crown: 1.5, rise: 1.9, limbs: 3, clump: 0.8, fill: 6, cards: 26, spray: 0.66, boughWood: false };
const bushB: BroadleafShape = { trunk: 0.2, girth: 0.06, crown: 2.1, rise: 1.5, limbs: 4, clump: 0.85, fill: 7, cards: 26, spray: 0.66, boughWood: false };

const bl = (seed: number, shape: BroadleafShape) => ({ seed, grow: { kind: 'broadleaf' as const, shape } });
const cf = (seed: number, shape: ConiferShape) => ({ seed, grow: { kind: 'conifer' as const, shape } });

/** A younger, narrower individual and an older spreading one share a branch habit. */
function broad(seed: number, traits: Partial<BroadleafShape>, sway: number, bark: SpeciesDef['bark'] = 'accent'): SpeciesDef {
  const a = { ...oakA, limbs: 4, cards: 30, fill: 6, ...traits };
  const b = { ...a, crown: a.crown*0.88, rise: a.rise*1.10, girth: a.girth*0.84 };
  return { variants: [bl(seed,a), bl(seed+17,b)], bark, sway };
}
function needle(seed: number, traits: Partial<ConiferShape>, sway: number): SpeciesDef {
  const a = { ...spruceA, tiers: 9, branches: 4, cards: 15, ...traits };
  const b = { ...a, base: a.base*1.18, height: a.height*0.91, radius: a.radius*1.09 };
  return { variants: [cf(seed,a), cf(seed+17,b)], bark:'accent', sway };
}
function special(seed: number, form: Special, sway: number): SpeciesDef {
  return { variants: [seed,seed+17].map(s=>({seed:s,grow:{kind:'special',form}})), bark:'accent', sway };
}

export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  broadleaf: broad(51, { trunk: 2.6, girth: 0.42, crown: 5.2, rise: 5.8, limbs: 3, clump: 1.82, clumpHeight: 0.9, fill: 4 }, 0.97, 'wood'),
  broadleaf2: broad(37, { trunk: 4.3, girth: 0.29, crown: 3.25, rise: 7.3, upright: 0.86, clump: 1.31, fill: 5, clumpHeight: 1.27 }, 1.03, 'wood'),
  broadleaf3: broad(11, { trunk: 1.6, girth: 0.53, crown: 6.5, rise: 3.0, horizontal: 0.55, clump: 1.95, fill: 4, lopsided: 1.8, clumpHeight: 0.56 }, 0.93, 'wood'),
  birch: { variants: [bl(103, birchA), bl(117, birchB)], bark: 'accent', sway: 1.3 },
  poplar: { variants: [bl(131, poplarA), bl(149, poplarB), bl(153, { ...oakB, trunk: 3.6, girth: 0.48, crown: 5.1, rise: 7.8, upright: 0.42, cards: 27, fill: 6 })], bark: 'wood', sway: 1.1 },
  conifer: { variants: [cf(211, spruceA), cf(227, spruceB)], bark: 'wood', sway: 0.6 },
  conifer2: { variants: [cf(239, pineA), cf(251, pineB)], bark: 'wood', sway: 0.6 },
  bush: { variants: [bl(71, bushA), bl(83, bushB)], bark: 'wood', sway: 1.4, small: true },
  bush_dry: { ...broad(1573, { ...bushA, trunk: 0.20, crown: 1.75, rise: 1.1, horizontal: 0.55, girth: 0.055, clump: 0.45, clumpHeight: 0.57, fill: 3, spray: 0.36, cards: 18 }, 0.85), small: true },
  bush_alpine: { ...broad(1605, { ...bushA, trunk: 0.12, crown: 1.8, rise: 0.65, horizontal: 0.86, girth: 0.055, clump: 0.79, clumpHeight: 0.42, fill: 4, spray: 0.41, cards: 20 }, 0.63), small: true },
  oak: broad(51, { trunk: 1.65, girth: 0.73, crown: 7.2, rise: 4.0, horizontal: 0.86, bend: 1.04, limbs: 5, clump: 1.52, clumpHeight: 0.84, fill: 3, spray: 0.98 }, 0.73),
  linden: broad(37, { trunk: 2.0, girth: 0.41, crown: 3.6, rise: 8.4, upright: 0.77, dome: true, clump: 1.70, fill: 12, spray: 1.02, leaf: 'heart' }, 0.86),
  ash: broad(71, { trunk: 3.6, girth: 0.36, crown: 4.9, rise: 7.2, upright: 0.66, limbs: 5, clump: 1.04, fill: 3, spray: 0.87, clumpHeight: 0.60, leaf: 'pinnate' }, 1.12),
  giant_broadleaf: broad(301, { roots: 'buttress', trunk: 3.8, girth: 0.95, crown: 8.8, rise: 8.2, clump: 2.9, limbs: 5, clumpHeight: 0.73 }, 0.55),
  beech: broad(333, { trunk: 1.34, girth: 0.46, rise: 7.2, crown: 5.15, upright: 0.56, dome: true, clump: 2.0, clumpHeight: 1.02, fill: 11, spray: 1.08 }, 0.71),
  maple: broad(365, { trunk: 2.0, crown: 4.4, rise: 6.1, upright: 0.47, dome: true, clump: 1.76, clumpHeight: 0.56, limbs: 5, fill: 12, spray: 1.02 }, 1.02),
  camphor: broad(397, { trunk: 2.1, girth: 0.53, crown: 6.4, rise: 5.8, clump: 2.4, clumpHeight: 0.68, fill: 7 }, 0.8),
  chestnut: broad(429, { trunk: 2.0, girth: 0.58, crown: 6.2, rise: 5.8, horizontal: 0.4, dome: true, limbs: 4, clump: 2.11, clumpHeight: 0.8, fill: 9, spray: 1.48 }, 0.83),
  aspen: broad(461, { ...birchA, limbs: 5, weep: 0, crown: 3.3, clump: 1.35, upright: 0.82, spray: 0.85 }, 1.4),
  desert_poplar: broad(493, { trunk: 2.3, girth: 0.55, crown: 4.6, rise: 6.2, clump: 1.65, lopsided: 1.28, fill: 4 }, 0.95),
  olive: broad(525, { trunk: 2.3, girth: 0.61, twist: true, horizontal: 0.55, bend: 1.35, crown: 3.7, rise: 2.8, clump: 1.06, clumpHeight: 0.57, spray: 0.71, fill: 3 }, 0.64),
  eucalyptus: broad(557, { trunk: 5.4, girth: 0.4, crown: 4.3, rise: 8.4, upright: 0.65, weep: 0.20, clump: 1.28, spray: 0.7, fill: 3 }, 1.24),
  acacia: broad(589, { trunk: 2.4, girth: 0.32, crown: 7.2, rise: 3.2, clump: 2.1, clumpHeight: 0.32, spray: 0.82, fill: 4 }, 0.83),
  rhododendron: { ...broad(621, { ...bushB, trunk: 0.32, limbs: 3, fill: 5, clump: 0.72, cards: 23 }, 0.96), small:true },
  willow: broad(653, { trunk: 2.8, girth: 0.48, crown: 5.1, rise: 4.6, clump: 1.45, limbs: 4, clumpHeight: 0.64, curtains: true, cards: 23, fill: 4, spray: 0.85 }, 0.82),
  baobab: broad(685, { trunk: 7.5, girth: 1.6, crown: 5.2, rise: 3.4, clump: 1.55, clumpHeight: 0.55, limbs: 5, fill: 3 }, 0.43),
  fruit_tree: broad(717, { trunk: 1.45, girth: 0.27, crown: 3.2, rise: 3.7, clump: 1.05, fill: 5, spray: 0.70, fruit:true }, 0.94,'wood'),
  spruce: needle(211,{ ...spruceA, branches: 4, tiers: 10, tierHeight: 0.87 },0.6),
  pine: needle(239,{ ...pineA, branches: 4 },0.68),
  redwood: needle(751,{ height: 22, base: 0.32, radius: 3.2, girth: 1.04, tiers: 11, clump: 1.25, droop: 0.22, taper: 0.83 },0.28),
  fir: needle(783,{ height: 15, base: 0.045, radius: 3, tierHeight: 0.93, droop: 0.12, ragged: 0.12, taper: 1.12, clump: 1.18 },0.55),
  larch: needle(815,{ height: 14, base: 0.19, radius: 2.9, clump: 0.88, droop: 0.35, ragged: 0.62, spray: 0.75 },0.96),
  cedar: needle(847,{ height: 13, base: 0.23, radius: 4.4, girth: 0.56, tiers: 7, clump: 1.52, droop: 0.05, taper: 0.52 },0.61),
  dwarf_pine: needle(879,{ height: 2.8, base: 0.04, radius: 3.3, girth: 0.16, tiers: 5, clump: 1.05, droop: 0, spray: 0.57, clouds: 0.6 },0.81),
  cypress: needle(911,{ height: 13, base: 0.07, radius: 0.88, girth: 0.26, clump: 1.07, tiers: 12, tierHeight: 1.65, droop: 0, spray: 0.62, taper: 0.54, ragged: 0.13 },0.64),
  stone_pine: needle(943,{ height: 10, base: 0.64, radius: 5.3, girth: 0.46, tiers: 6, clump: 1.54, droop: 0, clouds: 0.52, taper: 0.39 },0.62),
  juniper: needle(975,{ height: 5, base: 0.10, radius: 2.4, tiers: 6, clump: 0.86, ragged: 0.94, clouds: 0.42, taper: 0.77, spray: 0.64 },0.72),
  southern_beech: {
    variants: [
      bl(1231, { ...lindenA, trunk: 4.1, crown: 5.6, upright: 0.44, clumpHeight: 0.66, spray: 0.78, fill: 7, cards: 29 }),
      bl(1248, { ...oakA, trunk: 3.1, crown: 5.1, rise: 6.4, clumpHeight: 0.77, weep: 0.14, spray: 0.82, fill: 6, cards: 25 }),
      bl(1261, { ...wideA, trunk: 1.7, crown: 5.8, rise: 4.1, lopsided: 1.40, limbs: 4, clumpHeight: 0.62, fill: 5, cards: 25 }),
    ], bark: 'accent', sway: 0.76,
  },
  douglas_fir: needle(1263, { height: 19, base: 0.28, radius: 3.6, girth: 0.58, tiers: 10, clump: 1.3, droop: 0.31, taper: 0.65 }, 0.42),
  palo_verde: broad(1295, { trunk: 1.3, girth: 0.28, crown: 4.5, rise: 4.4, limbs: 5, clump: 1.02, fill: 3, cards: 22, spray: 0.59 }, 1.05),
  mesquite: broad(1327, { trunk: 0.72, girth: 0.38, crown: 4.7, rise: 3.6, limbs: 5, clump: 1.25, fill: 3, weep: 0.22, clumpHeight: 0.55, spray: 0.72, fruitShape:'pods' }, 0.74),
  lemon: broad(1359, { trunk: 0.9, girth: 0.17, crown: 2.3, rise: 2.5, clump: 0.95, fill: 7, spray: 0.59, fruitShape:'lemon' }, 0.82, 'wood'),
  river_fig: broad(1391, { trunk: 3.2, girth: 0.74, crown: 7.6, rise: 7.3, limbs: 5, clump: 2.28, fill: 7, spray: 1.22 }, 0.69),
  marula: broad(1423, { trunk: 3.3, girth: 0.53, crown: 5.4, rise: 5.9, limbs: 5, clump: 1.58, fill: 4, spray: 0.87 }, 0.88),
  blackwood_acacia: broad(1455, { trunk: 4.1, girth: 0.39, crown: 4.2, rise: 7.9, upright: 0.69, limbs: 5, clump: 1.51, fill: 6, spray: 0.71 }, 0.85),
  rimu: broad(1487, { trunk: 5.1, girth: 0.55, crown: 4.5, rise: 7.7, upright: 0.55, weep: 0.79, clump: 1.36, clumpHeight: 1.30, spray: 0.70, fill: 4, cards: 22 }, 0.93),
  mangrove: broad(1519, { roots:'stilts', trunk: 2.6, girth: 0.37, crown: 4.2, rise: 3.6, clump: 1.34, spray: 0.94, fill: 5, cards: 24 }, 0.69),
  chilean_firebush: broad(1551, { trunk: 2.1, girth: 0.24, crown: 3.25, rise: 4.2, upright: 0.42, clump: 1.03, spray: 0.74, fill: 4, fruitShape:'flowers' }, 1.04),
  // (the fourth round's families, docs/V3/nodes/R4-trees.md: drawn by the toolkit; these the M5 crowns' stand-ins for ?flora=m5)
  frailejon: { ...broad(1583, { ...bushA, trunk: 1.4, girth: 0.16, crown: 0.9, rise: 0.8, limbs: 2, clump: 0.5, fill: 3 }, 0.2), small: true },
  ocotillo: { ...broad(1617, { ...bushA, trunk: 0.2, crown: 1.4, rise: 4.0, upright: 1, limbs: 7, clump: 0.3, fill: 2 }, 0.5), small: true },
  araucaria: needle(1649, { height: 22, base: 0.6, radius: 4.2, tiers: 6, clump: 1.2, droop: 0, taper: 0.4 }, 0.3),
  dragon_tree: broad(1681, { trunk: 3.0, girth: 0.45, crown: 4.2, rise: 2.4, limbs: 7, clump: 1.2, clumpHeight: 0.4, fill: 4 }, 0.3),
  flame_tree: broad(1713, { trunk: 2.6, girth: 0.4, crown: 6.8, rise: 5.2, limbs: 6, clump: 2.0, clumpHeight: 0.55, fill: 8 }, 0.8, 'wood'),
  jacaranda: broad(1745, { trunk: 3.0, girth: 0.36, crown: 5.8, rise: 6.4, limbs: 5, clump: 1.8, fill: 8 }, 0.9, 'wood'),
  coconut_palm: special(1007,'coconut_palm',1.5),
  fan_palm: special(1039,'fan_palm',1.1),
  tree_fern: special(1071,'tree_fern',1.22),
  bamboo: special(1103,'bamboo',1.64),
  joshua_tree: special(1135,'joshua_tree',0.34),
  cactus: special(1167,'saguaro',0.04),
  saguaro: special(1199,'saguaro',0.04),
};

/** the variants a species is grown in, each a tree of its own (docs/V3/nodes/P3-variant-packs.md) */
export const VARIANTS = 8;

// (the ground field's forms the toolkit grows: crownData.ts, where the scatter reads them)
export { GROUND_KIT, GROUND_VARIANTS, groundFamily, groundKind } from './crownData';

/**
 * A species' variants: its own two or three shapes first, then more grown from them, each with a seed of its own and
 * its shape drawn a little otherwise — its sizes within a tenth either way, a limb or a tier more or fewer, a crown
 * fuller to one side — as two trees of one kind differ. The first stays the species' measure.
 */
export function variantsOf(def: SpeciesDef, n = VARIANTS): { seed: number; grow: SpeciesShape }[] {
  const out = def.variants.slice(0, n);
  for (let k = out.length; k < n; k++) {
    const base = def.variants[k % def.variants.length];
    const rnd = mulberry(base.seed * 31 + k * 977);
    const j = (x: number, f = 0.1): number => x * (1 + (rnd() * 2 - 1) * f);
    const seed = base.seed + 1009 * k;
    const g = base.grow;
    if (g.kind === 'broadleaf') {
      const s = g.shape;
      out.push({ seed, grow: { kind: 'broadleaf', shape: { ...s, crown: j(s.crown), rise: j(s.rise), trunk: j(s.trunk), girth: j(s.girth, 0.08), clump: j(s.clump, 0.08), lopsided: (s.lopsided ?? 0) + rnd() * 0.45, limbs: Math.max(2, s.limbs + Math.round(rnd() * 2 - 1)) } } });
    } else if (g.kind === 'conifer') {
      const s = g.shape;
      out.push({ seed, grow: { kind: 'conifer', shape: { ...s, height: j(s.height), radius: j(s.radius), base: j(s.base, 0.15), ragged: Math.min(1, j(s.ragged, 0.3)), tiers: Math.max(3, s.tiers + Math.round(rnd() * 2 - 1)) } } });
    } else out.push({ seed, grow: g });
  }
  return out;
}

/** one variant of a species grown at every level */
export interface SpeciesModels {
  family: string;
  def: SpeciesDef;
  /** grown by the plant toolkit (scene/flora): drawn with its atlas */
  kit?: boolean;
  /** by variant, by level */
  models: CrownModel[][];
  /** the variants' measure (m): the first variant's, which the catalogue's sizes are measured against */
  height: number;
  radius: number;
}

export function growSpeciesModel(g: SpeciesShape, seed: number, level: number, bare = false): CrownModel {
  if (g.kind === 'special') return growSpecial(g.form,seed,level);
  return g.kind === 'broadleaf' ? growBroadleaf(seed, g.shape, level, bare) : growConifer(seed, g.shape, level, bare);
}

let built: Map<string, SpeciesModels> | null = null;

/**
 * The world's families the plant toolkit has a kind for (docs/V3/nodes/P3-kit-world.md): drawn as that kind when the
 * toolkit is on (the default; `?flora=m5` turns it off: setFloraKit). Every family has a kind now.
 */
export const KIT_OF: Readonly<Record<string, string>> = {
  conifer: 'spruce', spruce: 'spruce', fir: 'spruce', douglas_fir: 'spruce', larch: 'spruce',
  conifer2: 'pine', pine: 'pine', stone_pine: 'stone_pine', cypress: 'cypress',
  broadleaf: 'oak', oak: 'oak',
  // (the fourth round, docs/V3/nodes/R4-trees.md: each broadleaf its own shape where all were the oak's)
  broadleaf3: 'chestnut', linden: 'linden', beech: 'beech', maple: 'maple', chestnut: 'chestnut', camphor: 'camphor',
  giant_broadleaf: 'emergent', ash: 'ash', marula: 'marula', river_fig: 'fig', southern_beech: 'nothofagus', desert_poplar: 'tugai',
  frailejon: 'frailejon', ocotillo: 'ocotillo', araucaria: 'araucaria', dragon_tree: 'dragon', flame_tree: 'cherry', jacaranda: 'cherry',
  birch: 'birch', aspen: 'birch', poplar: 'poplar', broadleaf2: 'linden',
  fruit_tree: 'cherry', lemon: 'cherry',
  coconut_palm: 'palm', fan_palm: 'palm',
  acacia: 'acacia', blackwood_acacia: 'acacia', palo_verde: 'acacia', mesquite: 'acacia',
  bamboo: 'bamboo', saguaro: 'saguaro', cactus: 'saguaro', baobab: 'baobab',
  bush: 'shrub_round', bush_dry: 'shrub_round', bush_alpine: 'shrub_round', rhododendron: 'shrub_round',
  // (the second round: docs/V3/nodes/P3-kit-more.md)
  eucalyptus: 'eucalyptus', willow: 'willow', olive: 'olive', mangrove: 'mangrove', tree_fern: 'tree_fern', juniper: 'juniper', dwarf_pine: 'juniper', cedar: 'cedar',
  // (the third round, every family now: docs/V3/nodes/P2-A-kit-default.md; the firebush grown as the cherry is, in its own colours)
  redwood: 'redwood', rimu: 'rimu', joshua_tree: 'joshua', chilean_firebush: 'cherry',
};

let floraKit = false;
/** whether the plant toolkit grows the families it has a kind for (the default; off with ?flora=m5) */
export const floraKitOn = (): boolean => floraKit;
/** the plant toolkit grows the families it has a kind for (before the first world is made: the species are grown once) */
export function setFloraKit(on: boolean): void {
  if (built && on !== floraKit) disposeCrownSpecies();
  floraKit = on;
}

/** every species, grown (once) */
export function crownSpecies(): Map<string, SpeciesModels> {
  if (built) return built;
  built = new Map();
  for (const [family, def] of Object.entries(SPECIES)) {
    const kind = floraKit ? KIT_OF[family] : undefined;
    if (kind) {
      // the toolkit's kind at its near and middle levels; its far picture and its shadow from its middle one
      const k = floraKind(kind);
      const models = def.variants.map((v) => {
        const near = growFlora(k, v.seed, 0);
        const mid = growFlora(k, v.seed, 1);
        return [near, mid, growFlora(k, v.seed, 1)];
      });
      built.set(family, { family, def, models, height: models[0][0].height, radius: models[0][0].radius, kit: true });
      continue;
    }
    const models = def.variants.map((v) => CROWN_LEVELS.map((_, level) => growSpeciesModel(v.grow, v.seed, level)));
    built.set(family, { family, def, models, height: models[0][0].height, radius: models[0][0].radius });
  }
  return built;
}

/** a species' geometries, to be let go of when no world draws them (tests) */
export function disposeCrownSpecies(): void {
  if (!built) return;
  for (const s of built.values()) for (const v of s.models) for (const m of v) m.geometry.dispose();
  built = null;
}

/** the triangles of every model, for the budget's sake (by family, by level, the variants' mean) */
export function crownBudget(): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const [family, s] of crownSpecies()) out[family] = CROWN_LEVELS.map((_, l) => Math.round(s.models.reduce((a, v) => a + v[l].triangles, 0) / s.models.length));
  return out;
}

