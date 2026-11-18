/**
 * Skills and the compendium: the contract (node N1 opens it for foraging; node N7 builds the whole of
 * progression on it). A skill is practised by doing (20 levels, a perk at 5, 10, 15 and 20, no level wall); the
 * compendium remembers what the player has seen and what they know. Types only: the logic is progress.ts.
 * Pure, no three, no DOM.
 */
import type { CompendiumId, SkillId, Text } from '../contracts/base';

export const SKILL_MAX_LEVEL = 20;

export interface PerkDef {
  /** unique among all perks: '<skill>_<what>' */
  readonly id: string;
  /** the level of its skill that grants it */
  readonly level: number;
  readonly name: Text;
  readonly blurb: Text;
}

export interface SkillDef {
  readonly id: SkillId;
  readonly name: Text;
  readonly perks: readonly PerkDef[];
}

/** a field of the compendium: 'forage' now; 'fish', 'animal', 'dish', 'wonder' later */
export type CompendiumDomain = string;

/** 0 never met, 1 met (picked, seen) but not known by name, 2 known */
export type Knowledge = 0 | 1 | 2;

/** how it became known, for the entry's line */
export type LearnedBy = 'page' | 'skill' | 'taste' | 'told';

export interface CompendiumEntry {
  readonly domain: CompendiumDomain;
  readonly id: CompendiumId;
  state: Knowledge;
  /** how many were picked, caught, cooked */
  count: number;
  /** the world's day it was first met, and how it came to be known */
  firstDay?: number;
  by?: LearnedBy;
}

/** what the save keeps (a slice of its own): skills' experience, perks follow from levels; entries that are not 0 */
export interface ProgressSave {
  xp: Record<SkillId, number>;
  entries: { d: CompendiumDomain; id: CompendiumId; s: Knowledge; n: number; day?: number; by?: LearnedBy }[];
}
