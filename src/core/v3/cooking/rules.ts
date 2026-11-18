/**
 * What comes out of the pot (node C1, docs/V3/nodes/C1-cooking.md): the rule engine. Given the way of cooking,
 * one to five portions and how well the steps went, it says which dish this is, how many it serves, what a
 * serving gives and how good it is. It always has an answer: a pot that satisfies a recipe is that dish, any
 * other pot is a dish named for what is mostly in it, and a pot nobody could name is still supper.
 *
 * A pure function of what it is handed: the same pot cooked the same way is the same dish for ever.
 */
import type { Text } from '../contracts/base';
import { ingredient } from './ingredients';
import { RECIPES } from './recipes';
import { FOOD_CAP, FREE_STARS, METHODS, POT_MAX, RECIPE_BONUS, type BuffId, type Dish, type DishClass, type IngClass, type Ingredient, type Method, type PotItem, type Recipe, type Slot, type StepScores } from './types';

/** classes that go with anything and never make a pot's main ingredient */
const SEASONING: ReadonlySet<IngClass> = new Set<IngClass>(['herb', 'spice', 'liquid']);
/** sweet things, and the things that do not go with them in one pot */
const SWEET: ReadonlySet<IngClass> = new Set<IngClass>(['fruit', 'sweet', 'flower']);
const SAVOURY: ReadonlySet<IngClass> = new Set<IngClass>(['meat', 'poultry', 'fish', 'shellfish', 'egg', 'mushroom']);
/** what a kettle takes */
const BREWS: ReadonlySet<IngClass> = new Set<IngClass>(['herb', 'flower', 'fruit', 'sweet', 'spice', 'liquid', 'nut']);

/** how a processed thing (a tin, frozen dumplings) gains by cooking: little, it is cooked already */
const PROCESSED_GAIN = 1.3;

/** does this portion fill this need? */
function fills(i: Ingredient, s: Slot): boolean {
  if (s.item !== undefined) return i.item === s.item;
  if (s.tag !== undefined) return i.tags.includes(s.tag);
  return !!s.cls && s.cls.includes(i.cls);
}

/** how particular a need is: an item more than a tag, a tag more than a class */
function weight(s: Slot): number {
  return (s.item !== undefined ? 3 : s.tag !== undefined ? 2 : 1) * s.n;
}

/**
 * Can the pot's portions fill every need of the recipe, each portion used once, with what is left over
 * allowed? Returns how particular the match is (0: no match). Pots are small (five portions), so the needs
 * are tried in order with backtracking.
 */
function matches(r: Recipe, pot: readonly Ingredient[]): number {
  const used = new Array<boolean>(pot.length).fill(false);
  const units: Slot[] = [];
  for (const s of r.need) for (let k = 0; k < s.n; k++) units.push(s);
  if (units.length > pot.length) return 0;
  // the most particular needs first: they have the fewest portions to choose from
  units.sort((a, b) => weight(b) / b.n - weight(a) / a.n);
  const place = (u: number): boolean => {
    if (u === units.length) return true;
    for (let p = 0; p < pot.length; p++) {
      if (used[p] || !fills(pot[p], units[u])) continue;
      used[p] = true;
      if (place(u + 1)) return true;
      used[p] = false;
    }
    return false;
  };
  if (!place(0)) return 0;
  // what is left over: seasonings always may; anything else only if the recipe allows its class
  let extras = 0;
  for (let p = 0; p < pot.length; p++) {
    if (used[p]) continue;
    const c = pot[p].cls;
    if (SEASONING.has(c)) continue;
    if (!r.also || !r.also.includes(c)) return 0;
    extras++;
  }
  let w = 0;
  for (const s of r.need) w += weight(s);
  // more particular needs win; of two as particular, the one with less left over
  return w * 10 - extras;
}

/** the recipe a pot is, cooked this way: the most particular one it satisfies; null: none */
export function recipeOf(method: Method, pot: readonly PotItem[]): Recipe | null {
  const ings: Ingredient[] = [];
  for (const p of pot) {
    const i = ingredient(p.item);
    if (!i) return null;
    ings.push(i);
  }
  let best: Recipe | null = null;
  let bestW = 0;
  for (const r of RECIPES) {
    if (r.method !== method) continue;
    const w = matches(r, ings);
    if (w > bestW) {
      bestW = w;
      best = r;
    }
  }
  return best;
}

/** names of dishes of no recipe: by the way of cooking and what is mostly in the pot */
const PLAIN: Readonly<Record<Method, { cls: DishClass; of: Partial<Record<IngClass, Text>>; other: Text }>> = {
  soup: { cls: 'soup', of: { mushroom: { zh: '蘑菇汤', en: 'Mushroom soup' }, veg: { zh: '野菜汤', en: 'Greens soup' }, root: { zh: '根茎汤', en: 'Root soup' }, fish: { zh: '鱼汤', en: 'Fish soup' }, shellfish: { zh: '海鲜汤', en: 'Shellfish soup' }, meat: { zh: '肉汤', en: 'Meat soup' }, poultry: { zh: '鸡汤', en: 'Chicken soup' }, grain: { zh: '粥', en: 'Gruel' } }, other: { zh: '一锅汤', en: 'A pot of soup' } },
  stew: { cls: 'stew', of: { meat: { zh: '炖肉', en: 'Meat stew' }, poultry: { zh: '炖鸡', en: 'Chicken stew' }, fish: { zh: '炖鱼', en: 'Fish stew' }, mushroom: { zh: '炖蘑菇', en: 'Mushroom stew' }, root: { zh: '炖根茎', en: 'Root stew' }, veg: { zh: '炖菜', en: 'Vegetable stew' } }, other: { zh: '杂烩', en: 'Hotchpotch' } },
  stirfry: { cls: 'stirfry', of: { veg: { zh: '炒野菜', en: 'Stir-fried greens' }, mushroom: { zh: '炒蘑菇', en: 'Stir-fried mushrooms' }, meat: { zh: '小炒肉', en: 'Stir-fried meat' }, poultry: { zh: '炒鸡丁', en: 'Stir-fried chicken' }, shellfish: { zh: '炒海鲜', en: 'Stir-fried shellfish' }, root: { zh: '炒根茎', en: 'Stir-fried roots' }, egg: { zh: '炒蛋', en: 'Scrambled eggs' } }, other: { zh: '小炒', en: 'Stir-fry' } },
  roast: { cls: 'roast', of: { meat: { zh: '烤肉', en: 'Roast meat' }, poultry: { zh: '烤鸡', en: 'Roast chicken' }, fish: { zh: '烤鱼', en: 'Grilled fish' }, shellfish: { zh: '烤海鲜', en: 'Grilled shellfish' }, mushroom: { zh: '烤蘑菇', en: 'Roast mushrooms' }, root: { zh: '烤根茎', en: 'Roast roots' }, veg: { zh: '烤蔬菜', en: 'Roast vegetables' }, nut: { zh: '烤坚果', en: 'Roast nuts' }, fruit: { zh: '烤果子', en: 'Roast fruit' } }, other: { zh: '烤串', en: 'Skewers' } },
  fry: { cls: 'fry', of: { meat: { zh: '煎肉排', en: 'Pan-fried steak' }, fish: { zh: '煎鱼', en: 'Pan-fried fish' }, egg: { zh: '煎蛋', en: 'Fried eggs' }, root: { zh: '煎根茎片', en: 'Fried root slices' }, mushroom: { zh: '煎蘑菇', en: 'Fried mushrooms' }, veg: { zh: '煎蔬菜', en: 'Fried vegetables' }, grain: { zh: '煎饼', en: 'Pancake' } }, other: { zh: '煎杂拌', en: 'Fry-up' } },
  steam: { cls: 'steam', of: { fish: { zh: '清蒸鱼', en: 'Steamed fish' }, shellfish: { zh: '蒸海鲜', en: 'Steamed shellfish' }, egg: { zh: '蒸蛋', en: 'Steamed egg' }, root: { zh: '蒸根茎', en: 'Steamed roots' }, veg: { zh: '蒸菜', en: 'Steamed greens' }, grain: { zh: '蒸饭', en: 'Steamed grain' }, mushroom: { zh: '蒸蘑菇', en: 'Steamed mushrooms' } }, other: { zh: '一笼蒸', en: 'Steamer basket' } },
  rice: { cls: 'rice', of: { grain: { zh: '杂粮饭', en: 'Mixed grain rice' } }, other: { zh: '杂粮饭', en: 'Mixed grain rice' } },
  bake: { cls: 'sweet', of: { fruit: { zh: '烤果派', en: 'Fruit bake' }, nut: { zh: '坚果饼', en: 'Nut cake' }, grain: { zh: '烤饼', en: 'Flatbread' }, root: { zh: '烤根茎', en: 'Baked roots' } }, other: { zh: '烤点心', en: 'Bake' } },
  mix: { cls: 'salad', of: { veg: { zh: '拌野菜', en: 'Tossed greens' }, fruit: { zh: '果盘', en: 'Fruit plate' }, nut: { zh: '拌坚果', en: 'Tossed nuts' }, mushroom: { zh: '拌蘑菇', en: 'Tossed mushrooms' } }, other: { zh: '凉拌杂菜', en: 'Mixed salad' } },
  brew: { cls: 'drink', of: { herb: { zh: '香草茶', en: 'Herb tea' }, flower: { zh: '花茶', en: 'Flower tea' }, fruit: { zh: '果茶', en: 'Fruit tea' }, sweet: { zh: '蜜水', en: 'Honey water' }, spice: { zh: '辣汤水', en: 'Spiced water' }, nut: { zh: '坚果露', en: 'Nut milk' } }, other: { zh: '热水', en: 'Hot water' } },
  dry: { cls: 'preserve', of: { mushroom: { zh: '蘑菇干', en: 'Dried mushrooms' }, fruit: { zh: '果干', en: 'Dried fruit' }, meat: { zh: '肉干', en: 'Jerky' }, fish: { zh: '鱼干', en: 'Dried fish' }, veg: { zh: '干菜', en: 'Dried greens' }, herb: { zh: '干香草', en: 'Dried herbs' }, root: { zh: '根茎干', en: 'Dried roots' }, shellfish: { zh: '干贝', en: 'Dried shellfish' } }, other: { zh: '干货', en: 'Dried goods' } },
  smoke: { cls: 'preserve', of: { meat: { zh: '熏肉', en: 'Smoked meat' }, poultry: { zh: '熏禽', en: 'Smoked fowl' }, fish: { zh: '熏鱼', en: 'Smoked fish' }, shellfish: { zh: '熏贝', en: 'Smoked shellfish' }, mushroom: { zh: '熏蘑菇', en: 'Smoked mushrooms' }, nut: { zh: '熏坚果', en: 'Smoked nuts' } }, other: { zh: '熏货', en: 'Smoked goods' } },
  pickle: { cls: 'preserve', of: { veg: { zh: '腌菜', en: 'Pickled greens' }, root: { zh: '腌根茎', en: 'Pickled roots' }, fruit: { zh: '果酱', en: 'Jam' }, fish: { zh: '腌鱼', en: 'Salted fish' }, meat: { zh: '腌肉', en: 'Salt meat' }, mushroom: { zh: '腌蘑菇', en: 'Pickled mushrooms' }, egg: { zh: '腌蛋', en: 'Pickled eggs' } }, other: { zh: '腌货', en: 'Pickles' } },
};

const ODD: Text = { zh: '说不清的一锅', en: 'A pot of something' };

/** the buff a dish of no recipe leaves, by what is mostly in it */
const PLAIN_BUFF: Partial<Record<IngClass, BuffId>> = { meat: 'sturdy', poultry: 'sturdy', fish: 'steady', shellfish: 'lucky', egg: 'vigor', mushroom: 'keen', veg: 'hydrated', root: 'hearty', grain: 'hearty', fruit: 'vigor', nut: 'sturdy', herb: 'cool', flower: 'steady', sweet: 'vigor' };
/** how long a dish of no recipe's buff lasts at three stars (s) */
const PLAIN_BUFF_S = 300;

/** how many it serves: one for up to three portions, two for more */
export function servingsOf(portions: number): number {
  return portions >= 4 ? 2 : 1;
}

/** how many times a recipe must have been cooked for each step of mastery: none, some, practised, mastered */
export const MASTERY: readonly number[] = [3, 8, 15];

function mastery(times: number): number {
  let m = 0;
  for (const t of MASTERY) if (times >= t) m++;
  return m / MASTERY.length;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Cook. `pot` is one to five portions (more are not taken: the first POT_MAX count); `times` is how often
 * this recipe was cooked before (ask recipeOf first to know which). Portions that are no ingredient at all
 * (a spanner in the soup) make the pot odd and add nothing.
 */
export function cook(method: Method, pot: readonly PotItem[], steps: StepScores, times = 0): Dish {
  const m = METHODS[method];
  const items = pot.slice(0, POT_MAX);
  const ings: (Ingredient | null)[] = items.map((p) => ingredient(p.item));
  const known = ings.filter((i): i is Ingredient => i !== null);
  const foreign = ings.length - known.length;
  const r = foreign === 0 && known.length > 0 ? recipeOf(method, items) : null;

  // what is mostly in it: the class with the most food (seasonings never)
  const by = new Map<IngClass, number>();
  for (const i of known) if (!SEASONING.has(i.cls)) by.set(i.cls, (by.get(i.cls) ?? 0) + Math.max(1, i.food));
  let main: IngClass | null = null;
  let most = 0;
  for (const [c, f] of by) {
    if (f > most) {
      most = f;
      main = c;
    }
  }
  if (!main && known.length) main = known[0].cls;

  // does it hang together? (a recipe always does)
  let odd = foreign > 0 || known.length === 0;
  if (!r && !odd) {
    const sweet = known.some((i) => SWEET.has(i.cls));
    const savoury = known.some((i) => SAVOURY.has(i.cls));
    if (sweet && savoury) odd = true;
    if (method === 'brew' && known.some((i) => !BREWS.has(i.cls))) odd = true;
    if (method === 'rice' && !known.some((i) => i.cls === 'grain')) odd = true;
    if (method === 'bake' && main !== null && (main === 'fish' || main === 'shellfish' || main === 'veg')) odd = true;
  }

  const servings = servingsOf(items.length);
  const heat = clamp01(steps.heat);

  // stars: what went in, the heat, the seasoning, the knife, practice
  let qSum = 0;
  let stale = 0;
  for (const p of items) {
    qSum += Math.min(5, Math.max(1, p.q ?? 2));
    if (p.fresh === 2) stale++;
  }
  const qIn = items.length ? (qSum / items.length - 1) / 4 : 0;
  let score: number;
  if (r) score = 0.35 * qIn + 0.25 * heat + 0.2 * clamp01(steps.season ?? 0.5) + 0.1 * clamp01(steps.knife ?? 0.5) + 0.1 * mastery(times);
  else score = 0.5 * qIn + 0.5 * heat;
  let stars = 1 + 4 * score - 0.5 * stale;
  if (!r && stars > FREE_STARS) stars = FREE_STARS;
  if (odd && stars > 2) stars = 2;
  stars = Math.round(stars < 1 ? 1 : stars > 5 ? 5 : stars);

  // what a serving gives
  let food = 0;
  let hp = 0;
  let sick: 0 | 1 | 2 = 0;
  for (const i of known) {
    food += i.food * (i.processed ? Math.min(m.gain, PROCESSED_GAIN) : m.gain);
    hp += i.hp;
    if (i.sick > sick) sick = i.sick;
    // what is not safe raw must have been through real heat
    if (!i.raw && (!m.heats || heat < 0.35) && sick < 1) sick = 1;
  }
  food = (food * (0.8 + 0.1 * stars)) / servings;
  if (r) food += RECIPE_BONUS;
  if (odd) food *= 0.8;
  if (method === 'brew') food = Math.min(food, 12);
  food = Math.round(food > FOOD_CAP ? FOOD_CAP : food);
  let water = m.water;
  for (const i of known) if (i.cls === 'liquid') water += 6;
  if (method === 'brew') water += 2 * Math.max(0, known.length - 1);

  const name = r ? r.name : odd || !main ? ODD : (PLAIN[method].of[main] ?? PLAIN[method].other);
  const cls = r ? r.cls : PLAIN[method].cls;
  let buff: BuffId | null = null;
  let buffS = 0;
  if (r) {
    buff = r.buff;
    buffS = r.buffS;
  } else if (!odd && main) {
    // enough heat in the spices warms whatever else it is
    let hot = 0;
    for (const i of known) hot += i.taste[3];
    buff = hot >= 3 ? 'warm' : (PLAIN_BUFF[main] ?? null);
    buffS = PLAIN_BUFF_S;
  }
  // (a recipe's and a plain dish's time are for three stars: fewer shorten it, more lengthen it)
  if (buff) buffS = Math.round(buffS * (0.55 + 0.15 * stars));
  return { recipe: r ? r.id : null, name, cls, servings, food, water, hp: Math.round(hp / servings), sick, buff, buffS, stars, odd };
}

/** how near a seasoning is to what a recipe wants, 0 … 1: the pot's tastes summed against the recipe's, taste by taste */
export function seasonScore(r: Recipe, pot: readonly PotItem[], added: readonly number[] = [0, 0, 0, 0, 0]): number {
  if (!r.taste) return 0.7;
  const have = [0, 0, 0, 0, 0];
  for (const p of pot) {
    const i = ingredient(p.item);
    if (i) for (let k = 0; k < 5; k++) have[k] += i.taste[k];
  }
  let miss = 0;
  let want = 0;
  for (let k = 0; k < 5; k++) {
    const h = Math.min(3, have[k] / Math.max(1, pot.length / 2) + (added[k] ?? 0));
    miss += Math.abs(h - r.taste[k]);
    want += r.taste[k];
  }
  return clamp01(1 - miss / Math.max(4, want + 2));
}
