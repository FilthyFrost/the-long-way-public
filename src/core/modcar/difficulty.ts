/**
 * How hard a journey is (docs/V3/plan/growth.md 定案 7, §六 6): chosen when a new game begins and kept with its
 * save — 舒适, 普通 (the default) or 艰苦, the hard one's survival more hardcore. Each is a set of factors on the
 * body's rules (vitals.ts: how fast one goes hungry, thirsty and cold, and how much it hurts when one does), on
 * how much the road gives (food, water, fuel and the rest: Nomad Drive's comfortable and hard settings are 40 %
 * more and 30 % less) and on how fast a vehicle wears. Pure data and maths.
 */
import type { Text } from './types';
import { VITALS, type VitalsRules } from './vitals';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export interface DifficultyDef {
  id: Difficulty;
  name: Text;
  /** what it is like, a line under the name on the new game's card */
  line: Text;
  /** the hunger and the thirst, as fast as the normal setting's times this */
  hunger: number;
  thirst: number;
  /** the cold: how fast the body loses heat to it */
  cold: number;
  /** what hunger, thirst, the cold and being ill take off one's health, times this */
  hurt: number;
  /** how fast one tires (energy, J6), times this */
  tired: number;
  /** how much the road gives (food, drink, fuel, coolant, medicine): times this */
  supply: number;
  /** how fast a vehicle's parts wear and its engine burns oil: times this */
  wear: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultyDef> = {
  easy: {
    id: 'easy',
    name: { zh: '舒适', en: 'Comfortable' },
    line: { zh: '饿得慢，路上东西多，车也耐用', en: 'Slow to go hungry, plenty by the road, a car that lasts' },
    hunger: 0.7,
    thirst: 0.7,
    cold: 0.7,
    hurt: 0.5,
    tired: 0.8,
    supply: 1.4,
    wear: 0.75,
  },
  normal: {
    id: 'normal',
    name: { zh: '普通', en: 'Normal' },
    line: { zh: '要吃要喝，要照顾车', en: 'Eat, drink and look after the car' },
    hunger: 1,
    thirst: 1,
    cold: 1,
    hurt: 1,
    tired: 1,
    supply: 1,
    wear: 1,
  },
  hard: {
    id: 'hard',
    name: { zh: '艰苦', en: 'Hard' },
    line: { zh: '饿得快、冷得快，东西少，车坏得快', en: 'Hunger and cold come fast, little to find, a car that wears' },
    hunger: 1.35,
    thirst: 1.35,
    cold: 1.4,
    hurt: 1.5,
    tired: 1.2,
    supply: 0.7,
    wear: 1.3,
  },
};

/** a difficulty from what a save or an address says (anything else: the normal one) */
export function difficultyOf(v: unknown): Difficulty {
  return v === 'easy' || v === 'hard' || v === 'normal' ? v : 'normal';
}

/** the body's rules at a difficulty: the normal ones with its factors on them */
export function vitalsRules(d: Difficulty, base: VitalsRules = VITALS): VitalsRules {
  const f = DIFFICULTY[d];
  if (d === 'normal') return base;
  return {
    ...base,
    foodDrain: base.foodDrain * f.hunger,
    waterDrain: base.waterDrain * f.thirst,
    tempLoss: base.tempLoss * f.cold,
    starveHp: base.starveHp * f.hurt,
    thirstHp: base.thirstHp * f.hurt,
    hypoHp: base.hypoHp * f.hurt,
    energyDrain: base.energyDrain * f.tired,
    sickHpEvery: base.sickHpEvery / f.hurt,
  };
}
