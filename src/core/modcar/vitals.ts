/**
 * The body (docs/MODCAR.md §13): health, stamina, food, water, body temperature and the bladder, as Arctic
 * Drive keeps them on its normal setting (its numbers are the starting point; the dials can move them), and
 * the effects that last a while — a drink too many, an energy drink, something bad eaten, a warming meal or
 * pill, hypothermia. Pure data and maths, no three, no DOM: the game steps it, feeds it what one does, and
 * draws it.
 *
 *   health 100   does not come back by itself; food gives a little over five seconds, painkillers at once, sleep
 *                four an hour (docs/V3/plan/growth.md §四)
 *   stamina 100  sprinting −6/s, a jump −12; back at +7.5/s two seconds after the last of them
 *   food 100     −0.0219/s (76 minutes, Nomad Drive's); at 0: −2 health every 10 s
 *   water 100    −0.0287/s (58 minutes, Nomad Drive's); +10 a tenth of a litre of water; at 0: −3 health every 3 s
 *   energy 100   awake −0.0222/s: under 20 (an hour on) one is sleepy — yawns, the view dims now and then, the
 *                steering slower — never more than that; sitting still in a seat brings it back slowly, coffee
 *                at once (40 a mug) and halves the loss for half an hour, sleep to the full
 *   ill          something bad eaten (spoiled, raw, a poisonous mushroom): health −1 every 30 s (15 s badly),
 *                sick up every 90 s (60 s), food and water with it; four (eight) minutes, or the stomach pills
 *   hurt         a fall from over 6 m (5 to 100, 25 m and over is the end), a crash at 6–20 m/s (1 to 15), a
 *                thorn (3): health off at once, and over 8 of it hurt for five minutes — a limp; painkillers and
 *                the first-aid pack end it
 *   body 37.5 °C colder than (20 − what one wears) round one: it falls (the gap × 0.0005 °C/s, never below
 *                28); else it climbs back at 0.3 °C/s; under 32 °C hypothermia: slower, −1 health every 5 s
 *   bladder 0-100 fills as one drinks (and slowly with the water in one); P held empties it; at 100 it goes
 */
import type { DrinkLiquid } from './items';

export interface VitalsRules {
  hpMax: number;
  staminaMax: number;
  sprintCost: number;
  jumpCost: number;
  staminaBack: number;
  staminaDelay: number;
  foodDrain: number;
  waterDrain: number;
  starveHp: number;
  starveEvery: number;
  thirstHp: number;
  thirstEvery: number;
  tempNormal: number;
  tempFloor: number;
  tempComfort: number;
  tempLoss: number;
  tempGain: number;
  hypoBelow: number;
  hypoHp: number;
  hypoEvery: number;
  hypoLinger: number;
  bladderFill: number;
  peeRate: number;
  /** spread over this long, the gains of a meal or a drink (s) */
  gainOver: number;
  /** energy lost each second awake; back each second sitting still in a seat (before the loss) */
  energyDrain: number;
  energySit: number;
  /** under this one is sleepy */
  sleepyBelow: number;
  /** ill (闹肚子 / 肚子疼得厉害): health off every so many seconds, and sick up every so many */
  sickHpEvery: number;
  vomitEvery: number;
  /** what being sick up takes off food and water */
  vomitFood: number;
  vomitWater: number;
  /** what sleep gives back an hour (health) */
  sleepHp: number;
}

export const VITALS: VitalsRules = {
  hpMax: 100,
  staminaMax: 100,
  sprintCost: 6,
  jumpCost: 12,
  staminaBack: 7.5,
  staminaDelay: 2,
  foodDrain: 100 / (76 * 60),
  waterDrain: 100 / (58 * 60),
  starveHp: 2,
  starveEvery: 10,
  thirstHp: 3,
  thirstEvery: 3,
  tempNormal: 37.5,
  tempFloor: 28,
  tempComfort: 20,
  tempLoss: 0.0005,
  tempGain: 0.3,
  hypoBelow: 32,
  hypoHp: 1,
  hypoEvery: 5,
  hypoLinger: 30,
  bladderFill: 0.1,
  peeRate: 18,
  gainOver: 5,
  energyDrain: 80 / 3600,
  energySit: 0.03,
  sleepyBelow: 20,
  sickHpEvery: 30,
  vomitEvery: 90,
  vomitFood: 12,
  vomitWater: 6,
  sleepHp: 4,
};

/** what lasts a while */
export type VitalEffect = 'drunk' | 'energy' | 'sick1' | 'sick2' | 'warm1' | 'warm2' | 'hypo' | 'wet' | 'hurt' | 'awake';

export const EFFECT_ZH: Record<VitalEffect, string> = {
  drunk: '醉了',
  energy: '精神抖擞',
  sick1: '闹肚子',
  sick2: '肚子疼得厉害',
  warm1: '身上暖和',
  warm2: '浑身发热',
  hypo: '冻僵了',
  wet: '淋湿了',
  hurt: '受伤',
  awake: '清醒',
};

/** how long each lasts when it starts (s); hypothermia lasts while one is cold */
const EFFECT_S: Record<VitalEffect, number> = { drunk: 30, energy: 30, sick1: 240, sick2: 480, warm1: 180, warm2: 300, hypo: 0, wet: 60, hurt: 300, awake: 1800 };

export interface Vitals {
  hp: number;
  stamina: number;
  food: number;
  water: number;
  /** body temperature (°C) */
  temp: number;
  bladder: number;
  /** rested 100 … 0 (absent in older saves: rested) */
  energy?: number;
  /** seconds since the last sprint or jump */
  rest: number;
  /** effects running: seconds left */
  effects: Partial<Record<VitalEffect, number>>;
  /** what a meal, a drink or a warming is still giving, a share each second until it is spent */
  gains: { food: number; hp: number; water: number; temp: number; left: number }[];
  /** the clocks of what hurts or helps every few seconds */
  ticks: { starve: number; thirst: number; cold: number; sick: number; warm: number; vomit?: number };
  /** hypothermia goes on this long after one is warm again (s) */
  coldHold: number;
  dead: boolean;
}

export function newVitals(): Vitals {
  return { hp: 100, stamina: 100, food: 100, water: 100, temp: 37.5, bladder: 0, energy: 100, rest: 99, effects: {}, gains: [], ticks: { starve: 0, thirst: 0, cold: 0, sick: 0, warm: 0, vomit: 0 }, coldHold: 0, dead: false };
}

/** what one is doing and what is round one, this step */
export interface VitalsInput {
  dt: number;
  /** running with Shift (and moving) */
  sprinting: boolean;
  /** jumped this step */
  jumped: boolean;
  /** the air round one (°C): the weather's, a room's, a cab with its heater */
  ambientC: number;
  /** what one wears keeps this much of the cold out (each point lowers the comfortable air by a degree) */
  warmth: number;
  /** out in the rain */
  rain: boolean;
  /** P held */
  peeing: boolean;
  /** what lasting things do to the body now (a meal's buff; later clothes): absent, the body is as it always was */
  mods?: BodyMods;
  /** sitting still in a seat (a vehicle standing): energy comes back slowly */
  resting?: boolean;
}

/** air hotter than this (°C) is hot: a cooling drink makes one thirst slower in it */
export const HOT_AIR = 26;

/**
 * What lasting things do to the body: a meal's buffs (node C1), later clothes. Neutral by default. The game
 * keeps one, brings it back to neutral each frame, lets the systems that have a say write into it, and hands
 * it to stepVitals; the body itself never keeps it.
 */
export interface BodyMods {
  /** hunger and thirst come this many times as fast (1: as always) */
  foodK: number;
  waterK: number;
  /** stamina comes back this many times as fast */
  staminaK: number;
  /** the cold bites as if one wore this much more (each point lowers the comfortable air by a degree) */
  warmth: number;
  /** in hot air (above HOT_AIR), thirst comes this many times as fast */
  heatWaterK: number;
}

/** a new BodyMods, neutral */
export function newBodyMods(): BodyMods {
  return { foodK: 1, waterK: 1, staminaK: 1, warmth: 0, heatWaterK: 1 };
}

/** bring a BodyMods back to neutral (allocates nothing) */
export function resetBodyMods(m: BodyMods): BodyMods {
  m.foodK = 1;
  m.waterK = 1;
  m.staminaK = 1;
  m.warmth = 0;
  m.heatWaterK = 1;
  return m;
}

/** what happened this step, for the screen and the sounds */
export interface VitalsEvents {
  /** health lost (and why) */
  hurt: number;
  why: '' | 'starve' | 'thirst' | 'cold' | 'sick' | 'fall' | 'crash' | 'thorn';
  died: boolean;
  /** the bladder went by itself */
  wet: boolean;
  /** sick up this step (ill) */
  vomit?: boolean;
}

function add(v: Vitals, e: VitalEffect, s = EFFECT_S[e]): void {
  v.effects[e] = Math.max(v.effects[e] ?? 0, s);
}

export function has(v: Vitals, e: VitalEffect): boolean {
  return (v.effects[e] ?? 0) > 0;
}

/** step the body by dt */
export function stepVitals(v: Vitals, inp: VitalsInput, R: VitalsRules = VITALS): VitalsEvents {
  const ev: VitalsEvents = { hurt: 0, why: '', died: false, wet: false };
  if (v.dead) return ev;
  const dt = inp.dt;
  // stamina: spent sprinting and jumping, back two seconds after
  if (inp.sprinting && v.stamina > 0) {
    v.stamina = Math.max(0, v.stamina - R.sprintCost * dt);
    v.rest = 0;
  }
  if (inp.jumped) {
    v.stamina = Math.max(0, v.stamina - R.jumpCost);
    v.rest = 0;
  }
  if (!inp.sprinting && !inp.jumped) v.rest += dt;
  const m = inp.mods;
  if (v.rest >= R.staminaDelay) v.stamina = Math.min(R.staminaMax, v.stamina + R.staminaBack * (m ? m.staminaK : 1) * dt);
  // food and water go down
  v.food = Math.max(0, v.food - R.foodDrain * (m ? m.foodK : 1) * dt);
  v.water = Math.max(0, v.water - R.waterDrain * (m ? m.waterK * (inp.ambientC > HOT_AIR ? m.heatWaterK : 1) : 1) * dt);
  // energy: lost awake (half as fast while coffee keeps one awake), back slowly sitting still in a seat
  const e = v.energy ?? 100;
  v.energy = Math.min(100, Math.max(0, e - R.energyDrain * (has(v, 'awake') ? 0.5 : 1) * dt + (inp.resting ? R.energySit * dt : 0)));
  // what a meal or a drink is still giving
  for (const g of v.gains) {
    const k = Math.min(1, dt / Math.max(1e-6, g.left));
    v.food = Math.min(100, v.food + g.food * k);
    v.hp = Math.min(R.hpMax, v.hp + g.hp * k);
    v.water = Math.min(100, v.water + g.water * k);
    v.temp = Math.min(R.tempNormal, v.temp + g.temp * k);
    g.food -= g.food * k;
    g.hp -= g.hp * k;
    g.water -= g.water * k;
    g.temp -= g.temp * k;
    g.left -= dt;
  }
  v.gains = v.gains.filter((g) => g.left > 1e-6);
  // the bladder fills with the water in one
  v.bladder = Math.min(100, v.bladder + R.bladderFill * (v.water / 100) * dt);
  if (inp.peeing && v.bladder > 0) v.bladder = Math.max(0, v.bladder - R.peeRate * dt);
  if (v.bladder >= 100) ev.wet = true;
  // body temperature: the cold gets in below what one wears keeps out (not while drunk: one does not feel it)
  if (inp.rain) add(v, 'wet');
  const warmth = inp.warmth + (m ? m.warmth : 0) - (has(v, 'wet') ? 25 : 0);
  const comfort = R.tempComfort - warmth;
  if (inp.ambientC < comfort && !has(v, 'drunk')) v.temp = Math.max(R.tempFloor, v.temp - (comfort - inp.ambientC) * R.tempLoss * dt);
  else v.temp = Math.min(R.tempNormal, v.temp + R.tempGain * dt);
  // a warming meal: five degrees every minute while it lasts
  if (has(v, 'warm1') || has(v, 'warm2')) {
    v.ticks.warm += dt;
    if (v.ticks.warm >= 60 - 1e-6) {
      v.ticks.warm -= 60;
      v.temp = Math.min(R.tempNormal, v.temp + 5);
    }
  } else v.ticks.warm = 0;
  // hypothermia: under 32 °C, and half a minute after
  if (v.temp < R.hypoBelow) {
    v.coldHold = R.hypoLinger;
    v.effects.hypo = 1;
  } else if (v.coldHold > 0) {
    v.coldHold -= dt;
    v.effects.hypo = v.coldHold > 0 ? 1 : 0;
  } else v.effects.hypo = 0;
  // what hurts: hunger, thirst, the cold, something bad eaten
  const hurt = (hp: number, why: VitalsEvents['why']): void => {
    v.hp = Math.max(0, v.hp - hp);
    ev.hurt += hp;
    ev.why = why;
  };
  if (v.food <= 0) {
    v.ticks.starve += dt;
    if (v.ticks.starve >= R.starveEvery - 1e-6) {
      v.ticks.starve -= R.starveEvery;
      hurt(R.starveHp, 'starve');
    }
  } else v.ticks.starve = 0;
  if (v.water <= 0) {
    v.ticks.thirst += dt;
    if (v.ticks.thirst >= R.thirstEvery - 1e-6) {
      v.ticks.thirst -= R.thirstEvery;
      hurt(R.thirstHp, 'thirst');
    }
  } else v.ticks.thirst = 0;
  if (has(v, 'hypo')) {
    v.ticks.cold += dt;
    if (v.ticks.cold >= R.hypoEvery - 1e-6) {
      v.ticks.cold -= R.hypoEvery;
      hurt(R.hypoHp, 'cold');
    }
  } else v.ticks.cold = 0;
  // ill: health off now and then, and sick up the odd time (twice as often badly)
  if (has(v, 'sick1') || has(v, 'sick2')) {
    const bad = has(v, 'sick2') ? 2 : 1;
    v.ticks.sick += dt;
    if (v.ticks.sick >= R.sickHpEvery / bad - 1e-6) {
      v.ticks.sick -= R.sickHpEvery / bad;
      hurt(1, 'sick');
    }
    v.ticks.vomit = (v.ticks.vomit ?? 0) + dt;
    const every = bad === 2 ? R.vomitEvery * (2 / 3) : R.vomitEvery;
    if (v.ticks.vomit >= every - 1e-6) {
      v.ticks.vomit -= every;
      v.food = Math.max(0, v.food - R.vomitFood);
      v.water = Math.max(0, v.water - R.vomitWater);
      ev.vomit = true;
    }
  } else {
    v.ticks.sick = 0;
    v.ticks.vomit = 0;
  }
  // the effects run down
  for (const k of Object.keys(v.effects) as VitalEffect[]) {
    if (k === 'hypo') continue;
    v.effects[k] = Math.max(0, (v.effects[k] ?? 0) - dt);
    if (!v.effects[k]) delete v.effects[k];
  }
  if (v.hp <= 0) {
    v.dead = true;
    ev.died = true;
  }
  return ev;
}

/** something eaten (food, pills): its food and health over five seconds, its effect after */
export function eat(v: Vitals, food: number, hp: number, effect?: VitalEffect, R: VitalsRules = VITALS): void {
  if (food > 0 || hp > 0) v.gains.push({ food, hp, water: 0, temp: 0, left: R.gainOver });
  if (effect) add(v, effect);
}

/** medicine: health at once, a warming over five seconds, a side effect with its chance (roll 0-1) */
export function medicate(v: Vitals, hp: number, warm: number, side: number, roll: number, R: VitalsRules = VITALS): VitalEffect | null {
  v.hp = Math.min(R.hpMax, v.hp + hp);
  if (warm > 0) v.gains.push({ food: 0, hp: 0, water: 0, temp: warm, left: R.gainOver });
  if (side > 0 && roll < side) {
    const e: VitalEffect = roll < side / 2 ? 'drunk' : 'sick2';
    add(v, e);
    return e;
  }
  return null;
}

/**
 * A drink: every tenth of a litre of water quenches 10 (and fills the bladder as much); alcohol makes one drunk,
 * an energy drink quick; coffee (docs/V3/nodes/M2-rv.md) quenches 6 a tenth of a litre, warms the body (4 °C a
 * litre, over a few seconds), keeps one warm a while and wakes one up as the energy drink does.
 */
export function drink(v: Vitals, liquid: DrinkLiquid, litres: number, R: VitalsRules = VITALS): void {
  if (litres <= 0) return;
  if (liquid === 'water' || liquid === 'coffee') {
    const coffee = liquid === 'coffee';
    const pts = (litres / 0.1) * (coffee ? COFFEE_QUENCH : 10);
    v.gains.push({ food: 0, hp: 0, water: pts, temp: coffee ? litres * COFFEE_WARM_C : 0, left: R.gainOver });
    v.bladder = Math.min(100, v.bladder + pts);
    if (coffee) {
      add(v, 'warm1');
      add(v, 'awake');
      v.energy = Math.min(100, (v.energy ?? 100) + litres * COFFEE_ENERGY);
    }
  } else if (liquid === 'alcohol') add(v, 'drunk');
  else if (liquid === 'milk') {
    // (docs/ND/PLAN.md: Nomad Drive's milk, 30 food and 10 water a litre — its food at our four fifths)
    v.gains.push({ food: litres * MILK_FOOD, hp: 0, water: litres * MILK_WATER, temp: 0, left: R.gainOver });
    v.bladder = Math.min(100, v.bladder + litres * MILK_WATER);
  } else add(v, 'energy');
}

/** is one sleepy (energy under the rules' line) */
export function sleepy(v: Vitals, R: VitalsRules = VITALS): boolean {
  return (v.energy ?? 100) < R.sleepyBelow;
}

/** what coffee gives back of energy a litre (a mug of a quarter litre: 40), and how long it keeps one awake */
export const COFFEE_ENERGY = 160;

/**
 * Hurt by the world (a fall, a crash, a thorn): health off at once, and over 8 of it one is hurt (受伤) for five
 * minutes. What it did (the events, as stepVitals gives them).
 */
export function injure(v: Vitals, hp: number, why: 'fall' | 'crash' | 'thorn'): VitalsEvents {
  const ev: VitalsEvents = { hurt: 0, why: '', died: false, wet: false };
  if (v.dead || hp <= 0) return ev;
  v.hp = Math.max(0, v.hp - hp);
  ev.hurt = hp;
  ev.why = why;
  if (hp > 8) add(v, 'hurt');
  if (v.hp <= 0) {
    v.dead = true;
    ev.died = true;
  }
  return ev;
}

/** what a fall from so high (m) takes off (Nomad Drive's: nothing under 6 m, 5 to 100 up to 25 m, the end over it) */
export function fallDamage(m: number): number {
  if (m < 6) return 0;
  if (m >= 25) return 1000;
  return 5 + ((m - 6) / 19) * 95;
}

/** what a crash at so fast (m/s, into what it hit) takes off one sitting in it: 1 at 6 m/s to 15 at 20, more beyond */
export function crashDamage(ms: number): number {
  if (ms < 6) return 0;
  if (ms <= 20) return 1 + ((ms - 6) / 14) * 14;
  return 15 + (ms - 20) * 2.5;
}

/** a thorn (a cactus, a thorny bush brushed against) */
export const THORN_HP = 3;

/** health given back by a medicine that also ends being hurt (painkillers, the first-aid pack) */
export function treat(v: Vitals, hp: number, R: VitalsRules = VITALS): void {
  v.hp = Math.min(R.hpMax, v.hp + hp);
  delete v.effects.hurt;
}

/**
 * A sleep of so many hours (a bed, a seat): energy full, health back by the rules' four an hour, hunger and thirst
 * at half their pace for the while (asleep), what lasts a while run on by it. The game moves its clock on.
 */
export function sleep(v: Vitals, hours: number, R: VitalsRules = VITALS, secondsPerHour = 100, bed = false): void {
  if (v.dead || hours <= 0) return;
  const s = hours * secondsPerHour;
  v.energy = 100;
  // (lying in a bed: half again the health an hour — docs/V3/plan/rv.md)
  v.hp = Math.min(R.hpMax, v.hp + R.sleepHp * hours * (bed ? 1.5 : 1));
  v.food = Math.max(0, v.food - R.foodDrain * 0.5 * s);
  v.water = Math.max(0, v.water - R.waterDrain * 0.5 * s);
  v.bladder = Math.min(95, v.bladder + R.bladderFill * 0.5 * s);
  v.stamina = R.staminaMax;
  for (const k of Object.keys(v.effects) as VitalEffect[]) {
    if (k === 'hypo') continue;
    v.effects[k] = Math.max(0, (v.effects[k] ?? 0) - s);
    if (!v.effects[k]) delete v.effects[k];
  }
}

/** how long a sleep lasts to be rested from where one is (h): eight from nothing in a seat, six in a bed, never under two */
export function sleepHours(v: Vitals, bed = false): number {
  return Math.max(2, Math.round(((bed ? 6 : 8) * (100 - (v.energy ?? 100))) / 100));
}

/** what a litre of milk feeds and quenches */
export const MILK_FOOD = 24;
export const MILK_WATER = 10;

/** medicine that settles the stomach (docs/ND/PLAN.md: Nomad Drive's pills and first-aid kit stop a poisoning): what was bad eaten is over */
export function cure(v: Vitals): void {
  delete v.effects.sick1;
  delete v.effects.sick2;
  v.ticks.sick = 0;
  v.ticks.vomit = 0;
}

/** what coffee quenches a tenth of a litre (water: 10), and how much warmer a litre of it makes one (°C) */
export const COFFEE_QUENCH = 6;
export const COFFEE_WARM_C = 4;

/** a first-aid kit: up again with this much health, half fed and half watered at least */
export function revive(v: Vitals, hp: number): void {
  v.dead = false;
  v.hp = hp;
  v.energy = Math.max(v.energy ?? 100, 50);
  v.food = Math.max(v.food, 50);
  v.water = Math.max(v.water, 50);
  v.temp = Math.max(v.temp, 34);
  v.effects = {};
  v.gains = [];
}

/** how fast one goes on foot (a share of the usual): quicker on an energy drink, slower frozen or relieving oneself, never under 35 % */
export function speedFactor(v: Vitals, peeing: boolean): number {
  let k = 1;
  if (has(v, 'energy')) k *= 1.5;
  if (has(v, 'hypo')) k *= 0.75;
  // (hurt: a limp; sleepy: heavy-footed)
  if (has(v, 'hurt')) k *= 0.85;
  if ((v.energy ?? 100) < VITALS.sleepyBelow) k *= 0.9;
  if (peeing) k *= 0.2;
  return Math.max(0.35, k);
}

/** may one sprint now */
export function canSprint(v: Vitals): boolean {
  return v.stamina > 0.5;
}
