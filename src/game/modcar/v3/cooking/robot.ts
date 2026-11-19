/**
 * The robot cook (node C1): for the scripts and the tests, a cook with hands of a given skill who cooks one
 * dish at a station through the panel's own logic — it presses the session's keys (session.ts) with the
 * delays and the errors of its hands, and nothing else — and says how long it took and what came out.
 *
 * Its hands: `reaction`, the seconds between seeing a thing and the key landing (a steady cook 0.3, a
 * clumsy one 1.2), and `error`, 0 … 1, how far off it is when it aims (at the knife's beat, at the moment a
 * roast is done, at the taste a dish wants). Its dice are its own, from `seed`: the same cook cooks the same
 * dish the same way every time.
 *
 * What to cook: a recipe (it takes what fills the recipe's needs from the ingredients at hand) or a list of
 * item ids (a pot of whatever they make). It cooks at a medium flame, stirs a stir-fry every second or so,
 * turns a roast or a fry once, takes it off when it judges it just right, lets a soup simmer at a low flame
 * through its wait, seasons towards what the recipe wants, and plates.
 */
import { ingredient } from '../../../../core/v3/cooking/ingredients';
import { recipe as recipeById } from '../../../../core/v3/cooking/recipes';
import { METHOD_STEPS, STEP_S } from '../../../../core/v3/cooking/steps';
import type { Dish, Ingredient, Method, Recipe, Slot } from '../../../../core/v3/cooking/types';
import { PINCH, TASTES } from './content';
import { potItems } from './pot';
import type { CookSession, PantryRow } from './session';

export interface RobotHands {
  /** seconds from seeing to the key landing */
  readonly reaction: number;
  /** 0 … 1: how far off its aim is */
  readonly error: number;
}

export interface RobotPlan {
  /** a recipe to cook (its way of cooking, and what fills its needs from what is at hand) */
  readonly recipe?: string;
  /** or these items, cooked this way */
  readonly items?: readonly string[];
  readonly method?: Method;
  /** the flame it cooks at (default medium) */
  readonly heat?: 1 | 2 | 3;
  /** leave it on the flame however done it is (a stew left to go over) */
  readonly forget?: boolean;
  readonly seed?: number;
}

export interface RobotReport {
  done: boolean;
  /** what went wrong (nothing at hand to fill the recipe, no such way here) */
  why: string;
  seconds: number;
  keys: number;
  dish: Dish | null;
}

/**
 * How long each thing takes a cook's hands besides the reaction (s): a step through the list, reaching for a
 * portion and putting it in, a pinch, tasting, plating — a cook who knows what they are doing, as the core
 * counts one (steps.ts STEP_S: 3 s a portion, 6 s of seasoning, 4 s of plating, the reaction included).
 */
const MOVE_S = 0.25;
const REACH_S = STEP_S.put - 0.3;
const PINCH_S = 0.6;
const TASTE_S = 2.0;
const PLATE_S = STEP_S.plate - 0.3;
const STIR_EVERY_S = 1.0;

/** does a portion fill a need of a recipe (rules.ts's own test, which is not exported) */
function fills(i: Ingredient, s: Slot): boolean {
  if (s.item !== undefined) return i.item === s.item;
  if (s.tag !== undefined) return i.tags.includes(s.tag);
  return !!s.cls && s.cls.includes(i.cls);
}

export class RobotCook {
  readonly report: RobotReport = { done: false, why: '', seconds: 0, keys: 0, dish: null };
  /** the items to put in, in order (worked out when it starts) */
  private want: string[] = [];
  private method: Method = 'soup';
  private wait = 0;
  private rnd: number;
  /** where its next cut aims, off the beat (0: on it) */
  private aim = 0;
  private stirT = 0;
  private turned = false;
  private takeAt = 1;
  private pinches: number[] = [];
  private tasted = false;
  private plating = false;

  /**
   * `press`: how a key reaches the panel — the game's own way, through the modal (system.ts gives it), so that
   * the robot's keys go where the keyboard's go; absent: straight into the session.
   */
  constructor(
    private readonly session: CookSession,
    private readonly plan: RobotPlan,
    private readonly hands: RobotHands,
    private readonly keyIn: (code: string) => boolean = (code) => session.key(code),
  ) {
    this.rnd = (plan.seed ?? 1) * 2654435761;
  }

  /** a number in [0, 1) of the robot's own (the same sequence for the same seed) */
  private roll(): number {
    this.rnd = (this.rnd * 1103515245 + 12345) % 2147483648;
    return this.rnd / 2147483648;
  }

  private press(code: string): boolean {
    this.report.keys++;
    return this.keyIn(code);
  }

  /** what to put in: the items of the plan, or what fills the recipe's needs from the rows at hand */
  private choose(rows: readonly PantryRow[]): string {
    const p = this.plan;
    if (p.items) {
      this.want = [...p.items];
      this.method = p.method ?? 'soup';
      return '';
    }
    if (!p.recipe) return 'nothing to cook';
    const r: Recipe = recipeById(p.recipe);
    this.method = r.method;
    const left = new Map<PantryRow, number>();
    for (const row of rows) left.set(row, row.item.n ?? 1);
    for (const s of r.need) {
      for (let k = 0; k < s.n; k++) {
        let found: PantryRow | null = null;
        for (const row of rows) {
          const i = ingredient(row.item.item);
          if (i && (left.get(row) ?? 0) > 0 && fills(i, s)) {
            found = row;
            break;
          }
        }
        if (!found) return `nothing at hand fills ${s.item ?? (s.tag ? `#${s.tag}` : s.cls?.join('/'))} of ${r.id}`;
        left.set(found, (left.get(found) ?? 1) - 1);
        this.want.push(found.item.item);
      }
    }
    return '';
  }

  /** start: what to cook is worked out from the ingredients at hand */
  start(): boolean {
    this.session.refresh();
    const why = this.choose(this.session.rows);
    if (why) {
      this.report.why = why;
      this.report.done = true;
      return false;
    }
    this.wait = this.hands.reaction;
    return true;
  }

  /** dt seconds of the robot: it waits out its delay, then does the next thing the pot asks for. True when it is done. */
  tick(dt: number): boolean {
    const rep = this.report;
    if (rep.done) return true;
    const s = this.session.state;
    if (!s) {
      rep.done = true;
      rep.why ||= 'the panel shut';
      return true;
    }
    rep.seconds += dt;
    this.stirT += dt;
    if (s.phase === 'knife') {
      this.cutStep();
      return false;
    }
    if (s.phase === 'heat' && this.stirStep(s.method)) return false;
    this.wait -= dt;
    if (this.wait > 0) return false;
    const h = this.hands;
    const next = (sec: number): void => {
      this.wait = sec + h.reaction * (0.6 + 0.8 * this.roll());
    };
    switch (s.phase) {
      case 'pick': {
        if (this.session.last && s.items.length === 0) {
          // (the dish of the last time is shown: done)
          if (rep.dish) {
            rep.done = true;
            return true;
          }
          this.press('KeyE');
          next(0.2);
          return false;
        }
        if (s.method !== this.method) {
          // (round the ways the station offers; past them all, it is not one of them)
          if (this.methodsTried++ > 16) {
            rep.done = true;
            rep.why = `no ${this.method} here`;
            return true;
          }
          this.press('KeyD');
          next(MOVE_S);
          return false;
        }
        if (s.items.length < this.want.length) {
          const id = this.want[s.items.length];
          const rows = this.session.rows;
          const at = rows.findIndex((r) => r.item.item === id);
          if (at < 0) {
            rep.done = true;
            rep.why = `no ${id} at hand`;
            return true;
          }
          if (this.session.sel !== at) {
            this.press(this.session.sel < at ? 'KeyS' : 'KeyW');
            next(MOVE_S);
            return false;
          }
          this.press('KeyE');
          next(REACH_S);
          return false;
        }
        // all in: it begins; the flame it wants
        this.press('Space');
        // (when it will judge a roast or a fry done: just right, give or take what its eye is worth)
        this.takeAt = 1 + (this.roll() - 0.5) * 0.9 * h.error;
        next(0.4);
        return false;
      }
      case 'heat': {
        const want = this.plan.heat ?? 2;
        if (s.heat !== want) {
          this.press(s.heat < want ? 'KeyW' : 'KeyS');
          next(0.15);
          return false;
        }
        const m = METHOD_STEPS[s.method];
        // (a way with a wait goes into it by itself; one without is taken off when it looks just right)
        if (m.waitS > 0 || this.plan.forget) return false;
        if (s.pot.d >= this.takeAt) {
          this.press('KeyE');
          next(0.5);
        }
        return false;
      }
      case 'wait': {
        // a low flame holds it through the wait (a robot told to forget it leaves the flame as it is)
        if (!this.plan.forget && s.heat !== 1) {
          this.press('KeyS');
          next(0.15);
        }
        return false;
      }
      case 'season':
        this.seasonStep(next);
        return false;
      case 'keep':
        return false;
      case 'plate': {
        if (!this.plating) {
          // (the bowl fetched and filled)
          this.plating = true;
          next(PLATE_S);
          return false;
        }
        this.press('KeyE');
        rep.dish = this.session.last;
        rep.done = true;
        return true;
      }
    }
    return false;
  }

  private methodsTried = 0;

  /** the knife: it presses as the marker comes to (or passes) where it aims, a little off the beat by its error */
  private cutStep(): void {
    const se = this.session;
    const m = se.marker();
    const was = this.lastMark;
    this.lastMark = m;
    if (se.knifeT < se.liftUntil || was < 0) return;
    const target = 0.5 + this.aim;
    if (Math.abs(m - target) < 0.015 || (was - target) * (m - target) < 0) {
      this.press('Space');
      this.aim = (this.roll() * 2 - 1) * 0.5 * this.hands.error;
    }
  }

  private lastMark = -1;

  /** a stir-fry stirred every second or so, a roast or a fry turned once half way; true when it did */
  private stirStep(method: Method): boolean {
    const m = METHOD_STEPS[method];
    const s = this.session.state!;
    if (this.plan.forget) return false;
    if (m.stir === 'stir' && this.stirT >= STIR_EVERY_S + this.hands.reaction * 0.5) {
      this.stirT = 0;
      this.press('Space');
      return true;
    }
    if (m.stir === 'turn' && !this.turned && s.pot.d >= 0.5) {
      this.turned = true;
      this.press('Space');
      return true;
    }
    return false;
  }

  /** seasoning: pinches towards what the recipe wants, as far off as its aim; a taste; done */
  private seasonStep(next: (sec: number) => void): void {
    const s = this.session.state!;
    const r = s.recipe ? recipeById(s.recipe) : null;
    if (!this.tasted) {
      this.tasted = true;
      this.pinches = [0, 0, 0, 0, 0];
      if (r?.taste) {
        // what the pot tastes of already (as seasonScore reads it), against what it wants
        const items = potItems(s, 0);
        const have = [0, 0, 0, 0, 0];
        for (const p of items) {
          const i = ingredient(p.item);
          if (i) for (let k = 0; k < 5; k++) have[k] += i.taste[k];
        }
        for (let k = 0; k < 5; k++) {
          const h = Math.min(3, have[k] / Math.max(1, items.length / 2));
          const off = (this.roll() * 2 - 1) * 1.5 * this.hands.error;
          this.pinches[k] = Math.max(0, Math.round((r.taste[k] - h + off) / PINCH));
        }
      }
      next(TASTE_S);
      return;
    }
    for (let k = 0; k < 5; k++) {
      if (this.pinches[k] <= 0) continue;
      this.pinches[k]--;
      this.press(TASTES[k].key);
      next(PINCH_S);
      return;
    }
    this.press('KeyE');
    next(0.4);
  }
}
