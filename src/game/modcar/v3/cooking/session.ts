/**
 * The cooking panel's logic (node C1): what each key does at a station, step by step, with no DOM — the panel
 * (panel.ts) draws it and hands it the keys, the robot cook (robot.ts) presses the same keys, the Node tests
 * press them too. One session is open at a time (the modal's), on one station's pot.
 *
 * The keys, step by step:
 *   choosing   A / D the way of cooking (of those the cookware at hand gives), W / S an ingredient, E one
 *              portion of it into the pot (up to five), Q the last one back out, Space: begin
 *   the knife  Space (or E) on the beat: the marker sweeps across, the middle is the beat; a portion takes
 *              CUTS_PER_PORTION cuts
 *   the flame  W / S or the wheel: off, low, medium, high; Space stirs a stir-fry, turns a roast or a fry;
 *              E takes it off the flame
 *   seasoning  Z X C V B a pinch of salt, sweet, sour, heat, savoury; R "season for me"; E done
 *   the wait   the flame as before; E plates it early; Esc: walk away, it keeps cooking at its flame
 *   plating    E: the dish into the hands
 *   the dish   E: another pot of the same way; Esc: done
 * Escape always shuts the panel (the modal does that); the pot stays as it is at the station.
 */
import { freshNow, freshStage, type ItemInstance } from '../../../../core/modcar/items';
import { ingredient } from '../../../../core/v3/cooking/ingredients';
import { recipe as recipeById } from '../../../../core/v3/cooking/recipes';
import { cook, recipeOf } from '../../../../core/v3/cooking/rules';
import { CUTS_PER_PORTION, knifeScore, METHOD_STEPS, STEP_S, type Heat } from '../../../../core/v3/cooking/steps';
import { POT_MAX, type Dish, type Method, type Recipe } from '../../../../core/v3/cooking/types';
import { PINCH, TASTES } from './content';
import { afterKnife, beginCooking, cutsWanted, keeps, keptEnough, newPotState, platePot, potItems, seasoned, takeOff, type PlatePerks, type PotState } from './pot';

/** one sweep of the knife's marker across (s): the beat is at its middle, once a sweep (a cut in the time the core gives one: steps.ts STEP_S.cut) */
export const KNIFE_SWEEP_S = STEP_S.cut;
/** after a cut the knife is up for this long (s): a cut in it does not count */
export const KNIFE_LIFT_S = 0.3;

/** an ingredient at hand, as the panel lists it */
export interface PantryRow {
  /** the stack (or the one thing) */
  readonly item: ItemInstance;
  /** what it is called now (a kind not known yet goes by its veiled name) */
  readonly name: string;
  /** where it is: in the hands, in a box in the hands, in a box set down near */
  readonly where: 'hand' | 'box' | 'near';
}

/** what a session needs of the game (the system gives it: system.ts) */
export interface SessionHost {
  /** the world's seconds now (freshness is read against them) */
  now(): number;
  /** the ways of cooking the station offers now (the cookware at hand) */
  methods(): readonly Method[];
  /** the ingredients at hand, worked out again */
  pantry(): readonly PantryRow[];
  /** one portion of a row out of where it is (null: there is none left) */
  takeOne(row: PantryRow): ItemInstance | null;
  /** a portion back into the hands (what does not fit is set down by the feet) */
  giveBack(item: ItemInstance): void;
  /** how often a recipe was cooked before */
  timesCooked(recipe: string): number;
  /** is a recipe known by name */
  known(recipe: string): boolean;
  /** the perks as they bear on this pot (cook_extra's roll made for this plating) */
  perks(): PlatePerks;
  /** the dish is cooked: hand it out (into the hands, the compendium, the skill, a line) */
  plated(dish: Dish, s: PotState): void;
  /** a sound of the game's own */
  sound(name: string, gain?: number): void;
}

/** the steps a pot will take, as the panel shows them in a row */
export type StepId = 'knife' | 'heat' | 'season' | 'wait' | 'keep' | 'plate';

export class CookSession {
  /** the station's pot this session works on (null: none open) */
  state: PotState | null = null;
  /** which ingredient is picked in the list */
  sel = 0;
  /** the dish just plated (shown until another pot begins) */
  last: Dish | null = null;
  /** the knife's marker: the session's clock since the knife step began, and until when the knife is up */
  knifeT = 0;
  liftUntil = -1;
  /** the error of the last cut (for the panel's mark), −1 none yet */
  lastCut = -1;
  /** the pantry as last worked out, and a count of changes (the panel redraws on it) */
  rows: readonly PantryRow[] = [];
  rev = 0;
  private rowsT = 0;
  /** the recipe the pot's contents make now, worked out when they change */
  private preview: { rev: number; method: Method | null; recipe: Recipe | null; name: string; odd: boolean } = { rev: -1, method: null, recipe: null, name: '', odd: false };
  private contentsRev = 0;

  constructor(private readonly host: SessionHost) {}

  /** open on a station's pot (its pot as it is; a new one of the first way offered when it has none) */
  open(s: PotState | null, make: (s: PotState) => void): PotState | null {
    let st = s;
    if (!st) {
      const m = this.host.methods();
      if (!m.length) {
        this.state = null;
        return null;
      }
      st = newPotState(m[0]);
      make(st);
    }
    this.state = st;
    this.last = null;
    this.knifeT = 0;
    this.liftUntil = -1;
    this.lastCut = -1;
    this.refresh();
    this.contentsRev++;
    return st;
  }

  close(): void {
    this.state = null;
  }

  /** the ingredients at hand worked out again (now, and a few times a second while the panel is open) */
  refresh(): void {
    this.rows = this.host.pantry();
    if (this.sel >= this.rows.length) this.sel = Math.max(0, this.rows.length - 1);
    this.rev++;
  }

  /** the session's part of a frame: the knife's marker; the pantry looked at again now and then */
  step(dt: number): void {
    if (!this.state) return;
    if (this.state.phase === 'knife') this.knifeT += dt;
    this.rowsT += dt;
    if (this.rowsT >= 0.5 && this.state.phase === 'pick') {
      this.rowsT = 0;
      this.refresh();
    }
  }

  /** where the knife's marker is now, 0 … 1 (the beat is at 0.5) */
  marker(): number {
    const u = (this.knifeT / KNIFE_SWEEP_S) % 2;
    return u < 1 ? u : 2 - u;
  }

  /** cuts made, and wanted */
  cutsDone(): number {
    return this.state ? this.state.cuts.length : 0;
  }

  cutsWanted(): number {
    return this.state ? cutsWanted(this.state, CUTS_PER_PORTION) : 0;
  }

  // ---------------------------------------------------------------- what the pot is

  /** the recipe the contents make now (null: none), the name the pot would go by, and whether nobody could name it */
  what(): { recipe: Recipe | null; name: string; odd: boolean } {
    const s = this.state;
    const p = this.preview;
    if (!s) return { recipe: null, name: '', odd: false };
    if (p.rev === this.contentsRev && p.method === s.method) return p;
    p.rev = this.contentsRev;
    p.method = s.method;
    if (!s.items.length) {
      p.recipe = null;
      p.name = '';
      p.odd = false;
      return p;
    }
    // (once the cooking began, what it is was fixed then)
    const items = potItems(s, this.host.now());
    p.recipe = s.phase === 'pick' ? recipeOf(s.method, items) : s.recipe ? recipeById(s.recipe) : null;
    if (p.recipe) {
      p.name = p.recipe.name.zh;
      p.odd = false;
    } else {
      const d = cook(s.method, items, { heat: 1 });
      p.name = d.name.zh;
      p.odd = d.odd;
    }
    return p;
  }

  /** the steps the pot will take (for the row of steps the panel shows) */
  steps(): StepId[] {
    const s = this.state;
    if (!s) return [];
    const m = METHOD_STEPS[s.method];
    const r = s.phase === 'pick' ? this.what().recipe : s.recipe ? recipeById(s.recipe) : null;
    const out: StepId[] = [];
    if (m.keepH !== undefined) {
      if (m.knife && r) out.push('knife');
      out.push('keep', 'plate');
      return out;
    }
    if (r && m.knife) out.push('knife');
    if (m.cookS > 0) out.push('heat');
    if (r && m.season) out.push('season');
    if (m.waitS > 0) out.push('wait');
    out.push('plate');
    return out;
  }

  // ---------------------------------------------------------------- the keys

  /** a key: true when it did something here */
  key(code: string): boolean {
    const s = this.state;
    if (!s) return false;
    if (this.last && s.phase === 'pick' && s.items.length === 0 && (code === 'KeyE' || code === 'Enter')) {
      // (the dish shown: E begins the next pot)
      this.last = null;
      return true;
    }
    switch (s.phase) {
      case 'pick':
        return this.keyPick(s, code);
      case 'knife':
        if (code === 'Space' || code === 'KeyE') return this.cut(s);
        return false;
      case 'heat':
      case 'wait':
        if (this.keyFlame(s, code)) return true;
        if (code === 'Space' && METHOD_STEPS[s.method].stir !== 'none') {
          s.stir = true;
          this.host.sound(METHOD_STEPS[s.method].stir === 'stir' ? 'stir' : 'turn', 0.5);
          return true;
        }
        if (code === 'KeyE' || code === 'Enter') {
          if (s.phase === 'heat') takeOff(s);
          else this.plate(s);
          return true;
        }
        return false;
      case 'season':
        if (s.lit && this.keyFlame(s, code)) return true;
        for (let k = 0; k < 5; k++) {
          if (code !== TASTES[k].key) continue;
          s.added[k] = Math.min(3, s.added[k] + PINCH);
          this.host.sound('pinch', 0.4);
          return true;
        }
        if (code === 'KeyR') {
          s.auto = !s.auto;
          return true;
        }
        if (code === 'KeyE' || code === 'Enter') {
          seasoned(s);
          return true;
        }
        return false;
      case 'keep':
        if (code === 'KeyE' || code === 'Enter') {
          if (keptEnough(s, this.host.now())) this.plate(s);
          return true;
        }
        return false;
      case 'plate':
        if (s.lit && this.keyFlame(s, code)) return true;
        if (code === 'KeyE' || code === 'Enter') {
          this.plate(s);
          return true;
        }
        return false;
    }
    return false;
  }

  /** the wheel: the flame (up: more) */
  wheel(dy: number): boolean {
    const s = this.state;
    if (!s || !s.lit) return false;
    return this.keyFlame(s, dy < 0 ? 'KeyW' : 'KeyS');
  }

  private keyFlame(s: PotState, code: string): boolean {
    if (!s.lit) return false;
    const up = code === 'KeyW' || code === 'ArrowUp';
    const down = code === 'KeyS' || code === 'ArrowDown';
    if (!up && !down) return false;
    const h = Math.max(0, Math.min(3, s.heat + (up ? 1 : -1))) as Heat;
    if (h !== s.heat) {
      s.heat = h;
      this.host.sound('flame', 0.4);
    }
    return true;
  }

  private keyPick(s: PotState, code: string): boolean {
    const rows = this.rows;
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'KeyS' || code === 'ArrowDown') {
      if (!rows.length) return true;
      const d = code === 'KeyW' || code === 'ArrowUp' ? -1 : 1;
      this.sel = (this.sel + d + rows.length) % rows.length;
      this.rev++;
      return true;
    }
    if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyD' || code === 'ArrowRight') {
      const ms = this.host.methods();
      if (ms.length < 2) return true;
      const i = Math.max(0, ms.indexOf(s.method));
      s.method = ms[(i + (code === 'KeyA' || code === 'ArrowLeft' ? ms.length - 1 : 1)) % ms.length];
      this.contentsRev++;
      this.rev++;
      return true;
    }
    if (code === 'KeyE' || code === 'Enter') return this.putIn(s);
    if (code === 'KeyQ' || code === 'Backspace') {
      const it = s.items.pop();
      if (it) {
        this.host.giveBack(it);
        this.contentsRev++;
        this.refresh();
      }
      return true;
    }
    if (code === 'Space') {
      if (!s.items.length) return true;
      beginCooking(s, this.host.now());
      this.knifeT = 0;
      this.liftUntil = -1;
      this.lastCut = -1;
      this.contentsRev++;
      this.host.sound(METHOD_STEPS[s.method].cookS > 0 ? 'flame' : 'pinch', 0.6);
      return true;
    }
    return false;
  }

  /** one portion of the picked row into the pot */
  private putIn(s: PotState): boolean {
    if (s.items.length >= POT_MAX) return true;
    const row = this.rows[this.sel];
    if (!row) return true;
    // (a thing that has turned does not go into a pot)
    if (row.item.fresh !== undefined && freshStage(freshNow(row.item, this.host.now())) >= 3) return true;
    const one = this.host.takeOne(row);
    if (!one) return true;
    s.items.push(one);
    this.contentsRev++;
    this.host.sound('putdown', 0.25);
    this.refresh();
    return true;
  }

  /** a cut: how far off the beat it was */
  private cut(s: PotState): boolean {
    if (this.knifeT < this.liftUntil) return true;
    const e = Math.min(1, Math.abs(this.marker() - 0.5) * 2);
    s.cuts.push(e);
    this.lastCut = e;
    this.liftUntil = this.knifeT + KNIFE_LIFT_S;
    this.host.sound('chop', 0.5);
    if (s.cuts.length >= this.cutsWanted()) afterKnife(s, this.host.now());
    return true;
  }

  /** the dish out of the pot and into the hands; the pot is empty again, of the same way */
  private plate(s: PotState): void {
    const now = this.host.now();
    const times = s.recipe ? this.host.timesCooked(s.recipe) : 0;
    const dish = platePot(s, now, times, this.host.perks(), knifeScore);
    this.host.plated(dish, s);
    this.last = dish;
    // the pot of the station, empty, ready for the next
    const m = s.method;
    const keepHeat = s.heat;
    Object.assign(s, newPotState(m));
    s.heat = keeps(m) ? 0 : keepHeat > 0 ? keepHeat : 0;
    this.contentsRev++;
    this.refresh();
  }

  /** is what the row holds an ingredient that may still go in (the list shows the rest greyed) */
  static usable(row: PantryRow, nowS: number): boolean {
    if (!ingredient(row.item.item)) return false;
    return row.item.fresh === undefined || freshStage(freshNow(row.item, nowS)) < 3;
  }
}
