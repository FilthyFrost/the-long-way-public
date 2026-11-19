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

export type SpeciesShape = { kind: 'broadleaf'; shape: BroadleafShape } | { kind: 'conifer'; shape: ConiferShape };

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
const wideA: BroadleafShape = { trunk: 1.9, girth: 0.55, crown: 7.0, rise: 6.4, limbs: 6, clump: 2.2, fill: 8, cards: 33, spray: 1.25, lopsided: 1.2 };
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

export const SPECIES: Readonly<Record<string, SpeciesDef>> = {
  broadleaf: { variants: [bl(51, oakA), bl(23, oakB)], bark: 'wood', sway: 1 },
  broadleaf2: { variants: [bl(37, lindenA), bl(61, lindenB)], bark: 'wood', sway: 1 },
  broadleaf3: { variants: [bl(11, wideA), bl(51, oakA)], bark: 'wood', sway: 1 },
  birch: { variants: [bl(103, birchA), bl(117, birchB)], bark: 'accent', sway: 1.3 },
  poplar: { variants: [bl(131, poplarA), bl(149, poplarB)], bark: 'wood', sway: 1.1 },
  conifer: { variants: [cf(211, spruceA), cf(227, spruceB)], bark: 'wood', sway: 0.6 },
  conifer2: { variants: [cf(239, pineA), cf(251, pineB)], bark: 'wood', sway: 0.6 },
  bush: { variants: [bl(71, bushA), bl(83, bushB)], bark: 'wood', sway: 1.4, small: true },
};

/** one variant of a species grown at every level */
export interface SpeciesModels {
  family: string;
  def: SpeciesDef;
  /** by variant, by level */
  models: CrownModel[][];
  /** the variants' measure (m): the first variant's, which the catalogue's sizes are measured against */
  height: number;
  radius: number;
}

function grown(g: SpeciesShape, seed: number, level: number): CrownModel {
  return g.kind === 'broadleaf' ? growBroadleaf(seed, g.shape, level) : growConifer(seed, g.shape, level);
}

let built: Map<string, SpeciesModels> | null = null;

/** every species, grown (once) */
export function crownSpecies(): Map<string, SpeciesModels> {
  if (built) return built;
  built = new Map();
  for (const [family, def] of Object.entries(SPECIES)) {
    const models = def.variants.map((v) => CROWN_LEVELS.map((_, level) => grown(v.grow, v.seed, level)));
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

