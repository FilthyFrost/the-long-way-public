/**
 * The body (docs/V3/plan/finish.md §三): one bar, and three needs under it. Pure data and maths, no three, no DOM:
 * the game steps it, feeds it what one does, and draws it.
 *
 *   life 0 … health   the lit part of the bar. Hunger at nothing takes 1 every 6 s (ten minutes from full), thirst at
 *                     nothing 1 every 3 s (five); a fall, a crash, a thorn take theirs at once. Neither hungry nor
 *                     thirsty (food and water over a quarter) it comes back by itself, 1 every 12 s, up to one's
 *                     health; a bandage and painkillers give theirs at once.
 *   health 0 … 100    the most life one can have: the bar's length; what is lost of it is the grey at the bar's end.
 *                     Being ill takes 1 every 30 s (15 s badly), frozen (the body under 32 °C) or heat-struck (over
 *                     39.5 °C) 1 every 8 s, a deadly mushroom 10 at once — and life goes down with it when it is
 *                     above it. It comes back sleeping (5 an hour in a bed, 2 in a seat), with a cooked dish (2 a
 *                     star), a first-aid box (30), and by itself when one is well: fed and watered over six tenths,
 *                     neither cold nor hot nor ill, 1 every four minutes. So a bed, a good meal and warm clothes
 *                     are what mend one; a tin and a bottle only keep one going.
 *   stamina 100       sprinting −6/s, a jump −12; back at +7.5/s two seconds after the last of them
 *   food 100          −0.0219/s (76 minutes); water 100 −0.0287/s (58 minutes), half again as fast in hot air
 *   energy 100        awake −0.0222/s: under 20 (an hour on) one is sleepy — yawns, the view dims now and then, the
 *                     steering slower — never more than that; sitting still in a seat brings it back slowly, coffee
 *                     at once (40 a mug) and halves the loss for half an hour, sleep to the full
 *   body 37.5 °C      air colder than (20 − what one wears): it falls (the gap × 0.0005 °C/s, never below 28); air
 *                     hotter than (34 − 0.4 × what one wears): it climbs (the gap × 0.00033 °C/s, never over 42 —
 *                     a coat in the desert is a bad thing to wear); between the two it comes back to 37.5, quickly
 *                     from the cold (0.3 °C/s), in under a minute from the heat (0.05 °C/s); water drunk cools a hot
 *                     body 2 °C a litre
 *   ill               something bad eaten (spoiled, raw, a poisonous mushroom): health off as above, sick up every
 *                     90 s (60 s badly), food and water with it; four (eight) minutes, or the stomach pills
 *   hurt              a blow of over 8: a limp for five minutes; a bandage or painkillers end it
 *
 * Dead with no life left, or no health left.
 */
import type { DrinkLiquid } from './items';

export interface VitalsRules {
  /** the most health there is (the bar's whole length) */
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
  /** life comes back by itself, a point every so many seconds, with food and water both over `fedAbove` */
  regenEvery: number;
  fedAbove: number;
  /** health comes back by itself, a point every so many seconds, when one is well: food and water over `wellAbove`, neither cold nor hot nor ill */
  wellEvery: number;
  wellAbove: number;
  tempNormal: number;
  tempFloor: number;
  tempCeil: number;
  tempComfort: number;
  tempLoss: number;
  tempGain: number;
  /** the air is hot above (heatLine − heatPerWarmth × what one wears): the body warms by the gap × heatGain (°C/s) */
  heatLine: number;
  heatPerWarmth: number;
  heatGain: number;
  /** a hot body out of the heat cools by this (°C/s) */
  tempCool: number;
  /** in hot air thirst comes this many times as fast */
  heatThirst: number;
  /** a litre of water drunk cools a hot body by this (°C) */
  drinkCool: number;
  hypoBelow: number;
  heatAbove: number;
  /** frozen or heat-struck: health off, every so many seconds, and for so long after the body is right again */
  hypoHp: number;
  hypoEvery: number;
  hypoLinger: number;
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
  /** what sleep gives back of health an hour: in a seat, in a bed */
  sleepCap: number;
  sleepCapBed: number;
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
  starveHp: 1,
  starveEvery: 6,
  thirstHp: 1,
  thirstEvery: 3,
  regenEvery: 12,
  fedAbove: 25,
  wellEvery: 240,
  wellAbove: 60,
  tempNormal: 37.5,
  tempFloor: 28,
  tempCeil: 42,
  tempComfort: 20,
  tempLoss: 0.0005,
  tempGain: 0.3,
  heatLine: 34,
  heatPerWarmth: 0.4,
  heatGain: 0.00033,
  tempCool: 0.05,
  heatThirst: 1.5,
  drinkCool: 2,
  hypoBelow: 32,
  heatAbove: 39.5,
  hypoHp: 1,
  hypoEvery: 8,
  hypoLinger: 30,
  gainOver: 5,
  energyDrain: 80 / 3600,
  energySit: 0.03,
  sleepyBelow: 20,
  sickHpEvery: 30,
  vomitEvery: 90,
  vomitFood: 12,
  vomitWater: 6,
  sleepCap: 2,
  sleepCapBed: 5,
};

/** what lasts a while */
export type VitalEffect = 'drunk' | 'energy' | 'sick1' | 'sick2' | 'warm1' | 'warm2' | 'hypo' | 'heat' | 'wet' | 'hurt' | 'awake';

export const EFFECT_ZH: Record<VitalEffect, string> = {
  drunk: '醉了',
  energy: '精神抖擞',
  sick1: '闹肚子',
  sick2: '肚子疼得厉害',
  warm1: '身上暖和',
  warm2: '浑身发热',
  hypo: '冻僵了',
  heat: '中暑了',
  wet: '淋湿了',
  hurt: '受伤',
  awake: '清醒',
};

/** how long each lasts when it starts (s); frozen and heat-struck last while the body is */
const EFFECT_S: Record<VitalEffect, number> = { drunk: 30, energy: 30, sick1: 240, sick2: 480, warm1: 180, warm2: 300, hypo: 0, heat: 0, wet: 60, hurt: 300, awake: 1800 };

/** what took health: the mark at the bar's grey end */
export type HealthLoss = 'sick' | 'cold' | 'heat' | 'poison';

export interface Vitals {
  /** life: the lit part of the bar, never over one's health */
  hp: number;
  /** health: the most life one can have now (absent in older saves: all of it) */
  cap?: number;
  /** what took health last (absent: nothing has) */
  capWhy?: HealthLoss;
  stamina: number;
  food: number;
  water: number;
  /** body temperature (°C) */
  temp: number;
  /** rested 100 … 0 (absent in older saves: rested) */
  energy?: number;
  /** seconds since the last sprint or jump */
  rest: number;
  /** effects running: seconds left */
  effects: Partial<Record<VitalEffect, number>>;
  /** what a meal, a drink or a warming is still giving, a share each second until it is spent (temp: warming above nothing, cooling below) */
  gains: { food: number; hp: number; water: number; temp: number; cap?: number; left: number }[];
  /** the clocks of what hurts or helps every few seconds */
  ticks: { starve: number; thirst: number; cold: number; sick: number; warm: number; vomit?: number; heat?: number };
  /** frozen goes on this long after one is warm again (s), heat-struck after one has cooled */
  coldHold: number;
  heatHold?: number;
  dead: boolean;
}

export function newVitals(): Vitals {
  return { hp: 100, cap: 100, stamina: 100, food: 100, water: 100, temp: 37.5, energy: 100, rest: 99, effects: {}, gains: [], ticks: { starve: 0, thirst: 0, cold: 0, sick: 0, warm: 0, vomit: 0, heat: 0 }, coldHold: 0, heatHold: 0, dead: false };
}

/** one's health: the most life one can have now */
export function healthOf(v: Vitals, R: VitalsRules = VITALS): number {
  return v.cap ?? R.hpMax;
}

/** what one is doing and what is round one, this step */
export interface VitalsInput {
  dt: number;
  /** running with Shift (and moving) */
  sprinting: boolean;
  /** jumped this step */
  jumped: boolean;
  /** the air round one (°C): the weather's, a room's, the shade's, a cab with its heater */
  ambientC: number;
  /** what one wears keeps this much of the cold out (each point lowers the comfortable air by a degree, and the air that is too hot by 0.4) */
  warmth: number;
  /** out in the rain */
  rain: boolean;
  /** what lasting things do to the body now (a meal's buff; later clothes): absent, the body is as it always was */
  mods?: BodyMods;
  /** sitting still in a seat (a vehicle standing): energy comes back slowly */
  resting?: boolean;
}

/** air hotter than this (°C) is warm: a cooling drink makes one thirst slower in it */
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
  /** in warm air (above HOT_AIR), thirst comes this many times as fast */
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
  /** life lost (and why) */
  hurt: number;
  why: '' | 'starve' | 'thirst' | 'cold' | 'heat' | 'sick' | 'fall' | 'crash' | 'thorn';
  /** health lost (its cause is the body's capWhy) */
  sapped: number;
  died: boolean;
  /** sick up this step (ill) */
  vomit?: boolean;
}

function add(v: Vitals, e: VitalEffect, s = EFFECT_S[e]): void {
  v.effects[e] = Math.max(v.effects[e] ?? 0, s);
}

export function has(v: Vitals, e: VitalEffect): boolean {
  return (v.effects[e] ?? 0) > 0;
}

/** the air that is too cold and the air that is too hot for what one wears (°C), wet through or not */
export function airLines(worn: number, wet: boolean, R: VitalsRules = VITALS): { cold: number; hot: number } {
  return { cold: R.tempComfort - (worn - (wet ? 25 : 0)), hot: R.heatLine - R.heatPerWarmth * Math.max(0, worn) };
}

/** health off, for a cause: life goes down with it when it is above it */
function sap(v: Vitals, n: number, why: HealthLoss, ev: VitalsEvents, R: VitalsRules): void {
  if (n <= 0) return;
  const cap = Math.max(0, healthOf(v, R) - n);
  v.cap = cap;
  v.capWhy = why;
  ev.sapped += n;
  if (v.hp > cap) v.hp = cap;
  if (cap <= 0) ev.why = why === 'poison' ? 'sick' : why;
}

/** step the body by dt */
export function stepVitals(v: Vitals, inp: VitalsInput, R: VitalsRules = VITALS): VitalsEvents {
  const ev: VitalsEvents = { hurt: 0, why: '', sapped: 0, died: false };
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
  // the air: too cold or too hot for what one wears (wet through, one is as good as bare; drunk, one does not feel the cold)
  if (inp.rain) add(v, 'wet');
  const lines = airLines(inp.warmth + (m ? m.warmth : 0), has(v, 'wet'), R);
  const cold = inp.ambientC < lines.cold && !has(v, 'drunk');
  const hot = !cold && inp.ambientC > lines.hot;
  // food and water go down (water half again as fast in the heat)
  v.food = Math.max(0, v.food - R.foodDrain * (m ? m.foodK : 1) * dt);
  v.water = Math.max(0, v.water - R.waterDrain * (m ? m.waterK * (inp.ambientC > HOT_AIR ? m.heatWaterK : 1) : 1) * (hot ? R.heatThirst : 1) * dt);
  // (sleep mechanic removed 2026-11-27: energy stays full, no drowsy state)
  v.energy = 100;
  // what a meal or a drink is still giving (a warming only warms a cold body, a cooling only cools a hot one)
  for (const g of v.gains) {
    const k = Math.min(1, dt / Math.max(1e-6, g.left));
    v.food = Math.min(100, v.food + g.food * k);
    if (g.cap) {
      v.cap = Math.min(R.hpMax, healthOf(v, R) + g.cap * k);
      g.cap -= g.cap * k;
    }
    v.hp = Math.min(healthOf(v, R), v.hp + g.hp * k);
    v.water = Math.min(100, v.water + g.water * k);
    if (g.temp > 0 && v.temp < R.tempNormal) v.temp = Math.min(R.tempNormal, v.temp + g.temp * k);
    else if (g.temp < 0 && v.temp > R.tempNormal) v.temp = Math.max(R.tempNormal, v.temp + g.temp * k);
    g.food -= g.food * k;
    g.hp -= g.hp * k;
    g.water -= g.water * k;
    g.temp -= g.temp * k;
    g.left -= dt;
  }
  v.gains = v.gains.filter((g) => g.left > 1e-6);
  // body temperature: down in the cold, up in the heat, back to its own between them
  if (cold) v.temp = v.temp > R.tempNormal ? Math.max(R.tempNormal, v.temp - R.tempCool * dt) : Math.max(R.tempFloor, v.temp - (lines.cold - inp.ambientC) * R.tempLoss * dt);
  else if (hot) v.temp = v.temp < R.tempNormal ? Math.min(R.tempNormal, v.temp + R.tempGain * dt) : Math.min(R.tempCeil, v.temp + (inp.ambientC - lines.hot) * R.heatGain * dt);
  else v.temp = v.temp < R.tempNormal ? Math.min(R.tempNormal, v.temp + R.tempGain * dt) : Math.max(R.tempNormal, v.temp - R.tempCool * dt);
  // a warming meal: five degrees every minute while it lasts (to a cold body)
  if (has(v, 'warm1') || has(v, 'warm2')) {
    v.ticks.warm += dt;
    if (v.ticks.warm >= 60 - 1e-6) {
      v.ticks.warm -= 60;
      if (v.temp < R.tempNormal) v.temp = Math.min(R.tempNormal, v.temp + 5);
    }
  } else v.ticks.warm = 0;
  // frozen under 32 °C, heat-struck over 39.5 °C, and half a minute after
  if (v.temp < R.hypoBelow) {
    v.coldHold = R.hypoLinger;
    v.effects.hypo = 1;
  } else if (v.coldHold > 0) {
    v.coldHold -= dt;
    v.effects.hypo = v.coldHold > 0 ? 1 : 0;
  } else v.effects.hypo = 0;
  if (v.temp > R.heatAbove) {
    v.heatHold = R.hypoLinger;
    v.effects.heat = 1;
  } else if ((v.heatHold ?? 0) > 0) {
    v.heatHold = (v.heatHold ?? 0) - dt;
    v.effects.heat = v.heatHold > 0 ? 1 : 0;
  } else v.effects.heat = 0;
  // what takes life: hunger and thirst at nothing
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
  // what takes health: frozen, heat-struck, ill
  if (has(v, 'hypo')) {
    v.ticks.cold += dt;
    if (v.ticks.cold >= R.hypoEvery - 1e-6) {
      v.ticks.cold -= R.hypoEvery;
      sap(v, R.hypoHp, 'cold', ev, R);
    }
  } else v.ticks.cold = 0;
  if (has(v, 'heat')) {
    v.ticks.heat = (v.ticks.heat ?? 0) + dt;
    if (v.ticks.heat >= R.hypoEvery - 1e-6) {
      v.ticks.heat -= R.hypoEvery;
      sap(v, R.hypoHp, 'heat', ev, R);
    }
  } else v.ticks.heat = 0;
  // ill: health off now and then, and sick up the odd time (twice as often badly)
  const ill = has(v, 'sick1') || has(v, 'sick2');
  if (ill) {
    const bad = has(v, 'sick2') ? 2 : 1;
    v.ticks.sick += dt;
    if (v.ticks.sick >= R.sickHpEvery / bad - 1e-6) {
      v.ticks.sick -= R.sickHpEvery / bad;
      sap(v, 1, 'sick', ev, R);
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
  // what gives back: life by itself when neither hungry nor thirsty, health by itself when one is well
  const cap = healthOf(v, R);
  if (v.hp > cap) v.hp = cap;
  if (v.food > R.fedAbove && v.water > R.fedAbove && v.hp < cap) v.hp = Math.min(cap, v.hp + dt / R.regenEvery);
  if (cap < R.hpMax && v.food > R.wellAbove && v.water > R.wellAbove && !ill && !has(v, 'hypo') && !has(v, 'heat') && !cold && !hot) v.cap = Math.min(R.hpMax, cap + dt / R.wellEvery);
  // the effects run down
  for (const k of Object.keys(v.effects) as VitalEffect[]) {
    if (k === 'hypo' || k === 'heat') {
      if (!v.effects[k]) delete v.effects[k];
      continue;
    }
    v.effects[k] = Math.max(0, (v.effects[k] ?? 0) - dt);
    if (!v.effects[k]) delete v.effects[k];
  }
  if (v.hp <= 0 || healthOf(v, R) <= 0) {
    v.dead = true;
    ev.died = true;
  }
  return ev;
}

/**
 * Something eaten (food, pills): its food and life over five seconds, its effect after. Life written below nothing
 * is poison (a deadly mushroom's ten): that much health off at once. What it did (the events, as stepVitals gives
 * them).
 */
export function eat(v: Vitals, food: number, hp: number, effect?: VitalEffect, R: VitalsRules = VITALS): VitalsEvents {
  if (food > 0 || hp > 0) v.gains.push({ food, hp: Math.max(0, hp), water: 0, temp: 0, left: R.gainOver });
  if (effect) add(v, effect);
  return hp < 0 ? poison(v, -hp, R) : { hurt: 0, why: '', sapped: 0, died: false };
}

/** a cooked dish eaten: its food, and what a good one mends — that much health back and life with it — over five seconds */
export function dine(v: Vitals, food: number, good: number, R: VitalsRules = VITALS): void {
  if (food > 0 || good > 0) v.gains.push({ food, hp: good, water: 0, temp: 0, cap: good, left: R.gainOver });
}

/** health given back (a first-aid box): over five seconds */
export function mend(v: Vitals, cap: number, R: VitalsRules = VITALS): void {
  if (cap > 0) v.gains.push({ food: 0, hp: 0, water: 0, temp: 0, cap, left: R.gainOver });
}

/** poison (a deadly mushroom): health off at once. What it did (the events, as stepVitals gives them). */
export function poison(v: Vitals, cap: number, R: VitalsRules = VITALS): VitalsEvents {
  const ev: VitalsEvents = { hurt: 0, why: '', sapped: 0, died: false };
  if (v.dead || cap <= 0) return ev;
  sap(v, cap, 'poison', ev, R);
  if (healthOf(v, R) <= 0) {
    v.dead = true;
    ev.died = true;
  }
  return ev;
}

/** medicine: life at once (never over one's health), a warming over five seconds */
export function medicate(v: Vitals, hp: number, warm: number, R: VitalsRules = VITALS): void {
  v.hp = Math.min(healthOf(v, R), v.hp + hp);
  if (warm > 0) v.gains.push({ food: 0, hp: 0, water: 0, temp: warm, left: R.gainOver });
}

/**
 * A drink: every tenth of a litre of water quenches 10 and cools a hot body; alcohol makes one drunk, an energy
 * drink quick; coffee (docs/V3/nodes/M2-rv.md) quenches 6 a tenth of a litre, warms a cold body (4 °C a litre,
 * over a few seconds), keeps one warm a while and wakes one up as the energy drink does.
 */
export function drink(v: Vitals, liquid: DrinkLiquid, litres: number, R: VitalsRules = VITALS): void {
  if (litres <= 0) return;
  if (liquid === 'water' || liquid === 'coffee') {
    const coffee = liquid === 'coffee';
    const pts = (litres / 0.1) * (coffee ? COFFEE_QUENCH : 10);
    v.gains.push({ food: 0, hp: 0, water: pts, temp: coffee ? litres * COFFEE_WARM_C : -litres * R.drinkCool, left: R.gainOver });
    if (coffee) {
      add(v, 'warm1');
      add(v, 'awake');
      v.energy = Math.min(100, (v.energy ?? 100) + litres * COFFEE_ENERGY);
    }
  } else if (liquid === 'alcohol') add(v, 'drunk');
  else if (liquid === 'milk') {
    // (docs/ND/PLAN.md: Nomad Drive's milk, 30 food and 10 water a litre — its food at our four fifths)
    v.gains.push({ food: litres * MILK_FOOD, hp: 0, water: litres * MILK_WATER, temp: 0, left: R.gainOver });
  } else add(v, 'energy');
}

/** sleep mechanic removed (2026-11-27): never sleepy */
export function sleepy(_v: Vitals, _R: VitalsRules = VITALS): boolean {
  return false;
}

/** what coffee gives back of energy a litre (a mug of a quarter litre: 40), and how long it keeps one awake */
export const COFFEE_ENERGY = 160;

/**
 * Hurt by the world (a fall, a crash, a thorn): life off at once, and over 8 of it one is hurt (受伤) for five
 * minutes. What it did (the events, as stepVitals gives them).
 */
export function injure(v: Vitals, hp: number, why: 'fall' | 'crash' | 'thorn'): VitalsEvents {
  const ev: VitalsEvents = { hurt: 0, why: '', sapped: 0, died: false };
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

/** life given back by a medicine that also ends being hurt (a bandage, painkillers) */
export function treat(v: Vitals, hp: number, R: VitalsRules = VITALS): void {
  v.hp = Math.min(healthOf(v, R), v.hp + hp);
  delete v.effects.hurt;
}

/**
 * A sleep of so many hours (a bed, a seat): energy full, health back by the rules' two an hour (five lying in a
 * bed) and life with it as it comes back awake, hunger and thirst at half their pace for the while (asleep), what
 * lasts a while run on by it. The game moves its clock on.
 */
export function sleep(v: Vitals, hours: number, R: VitalsRules = VITALS, secondsPerHour = 100, bed = false): void {
  if (v.dead || hours <= 0) return;
  const s = hours * secondsPerHour;
  v.energy = 100;
  v.cap = Math.min(R.hpMax, healthOf(v, R) + (bed ? R.sleepCapBed : R.sleepCap) * hours);
  v.hp = Math.min(v.cap, v.hp + s / R.regenEvery);
  v.food = Math.max(0, v.food - R.foodDrain * 0.5 * s);
  v.water = Math.max(0, v.water - R.waterDrain * 0.5 * s);
  v.stamina = R.staminaMax;
  for (const k of Object.keys(v.effects) as VitalEffect[]) {
    if (k === 'hypo' || k === 'heat') continue;
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

/** medicine that settles the stomach: what was bad eaten is over */
export function cure(v: Vitals): void {
  delete v.effects.sick1;
  delete v.effects.sick2;
  v.ticks.sick = 0;
  v.ticks.vomit = 0;
}

/** what coffee quenches a tenth of a litre (water: 10), and how much warmer a litre of it makes one (°C) */
export const COFFEE_QUENCH = 6;
export const COFFEE_WARM_C = 4;

/** a first-aid box carried when one falls: up again with this much life (and health for it), half fed and half watered at least, neither frozen nor heat-struck */
export function revive(v: Vitals, hp: number, R: VitalsRules = VITALS): void {
  v.dead = false;
  v.cap = Math.max(healthOf(v, R), hp);
  v.hp = hp;
  v.energy = Math.max(v.energy ?? 100, 50);
  v.food = Math.max(v.food, 50);
  v.water = Math.max(v.water, 50);
  v.temp = Math.min(Math.max(v.temp, 34), 38.5);
  v.coldHold = 0;
  v.heatHold = 0;
  v.effects = {};
  v.gains = [];
}

/** how fast one goes on foot (a share of the usual): quicker on an energy drink, slower frozen, heat-struck, hurt or sleepy, never under 35 % */
export function speedFactor(v: Vitals): number {
  let k = 1;
  if (has(v, 'energy')) k *= 1.5;
  if (has(v, 'hypo')) k *= 0.75;
  if (has(v, 'heat')) k *= 0.85;
  // (hurt: a limp)
  if (has(v, 'hurt')) k *= 0.85;
  return Math.max(0.35, k);
}

/** may one sprint now */
export function canSprint(v: Vitals): boolean {
  return v.stamina > 0.5;
}

/** how the body feels the air, for the screen: 冷 and 热 before it does harm, 冻僵 and 中暑 when it does */
export function feels(v: Vitals): '' | 'chilly' | 'frozen' | 'warm' | 'heat' {
  if (has(v, 'hypo')) return 'frozen';
  if (has(v, 'heat')) return 'heat';
  if (v.temp < 35.5) return 'chilly';
  if (v.temp > 38.5) return 'warm';
  return '';
}
