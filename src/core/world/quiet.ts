/**
 * The quiet stretches (docs/DESIGN_V2.md 3.2: "敢保留长段的安静"; 3.3: every segment keeps a few
 * minutes of road where nothing happens). Once a journey is under way — from its fourth chapter on;
 * the first three are laid out as they always were — every block of nine stretches (about one
 * segment, 11 km) has two in a row left alone: no place to stop, no lake by the road, no bridge, no
 * colossal remain coming up. The road, the land, the weather and the odd wreck on the verge are still
 * there: quiet, not empty.
 *
 * Pure: the dice and the chapter plan decide, so the water, the places and the landmarks all agree.
 *
 * This is the quiet rule of world version 1 (rules.ts RULES_V1.quiet; a world asks its rules, never this
 * file). The rules load this file, so it knows the chapter plan by its type only and takes the length of
 * a stretch from the plan's rules.
 */
import { hash2 } from '../math/rng';
import type { ChapterPlan } from './spine';

/** stretches to a block */
export const QUIET_BLOCK = 9;
/** the first chapter that has quiet stretches */
export const QUIET_FROM_CHAPTER = 3;

/** is stretch k one of the quiet ones? */
export function quietSlot(plan: ChapterPlan, seed: number, k: number): boolean {
  if (k < 0) return false;
  const b = Math.floor(k / QUIET_BLOCK);
  // two neighbours somewhere inside the block, never across its edge
  const k0 = b * QUIET_BLOCK + 1 + (hash2(b, 0x9017e, seed | 0) % (QUIET_BLOCK - 3));
  if (k !== k0 && k !== k0 + 1) return false;
  // (both of the pair, or neither: the chapter is asked where the pair begins)
  return plan.chapterAt((k0 + 0.5) * plan.rules.slot) >= QUIET_FROM_CHAPTER;
}
