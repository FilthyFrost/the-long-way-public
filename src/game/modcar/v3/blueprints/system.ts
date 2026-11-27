/**
 * Blueprints (docs/V3/plan/finish.md §六 2): a sheet that says how a thing is made. In the hands, the right button
 * learns it: the sheet is used up, the making is known for good (it is kept with the game) and what it shows is on
 * every bench's list from then on. One already known says so and stays in the hands — it can go into the recycler.
 * What a sheet makes is a thing like any other: the roof rack, the ladder and the motorcycle rack are parts, fitted
 * as parts are.
 */
import type { System } from '../../../../core/kernel/systems';
import { recipeOfBlueprint, type Recipe } from '../../../../core/modcar/crafting';
import type { GameContext } from '../../kernel/context';
import type { Action } from '../../hudItems';
import type { HandsUse, Held } from '../../player';

export class Blueprints implements System<GameContext> {
  readonly id = 'blueprints';
  readonly budget = { cpuMs: 0.05 };
  private ctx: GameContext | null = null;
  /** the right button has been seen up with this sheet in the hands (one held down as it came into them learns nothing) */
  private armed = false;

  readonly hands: HandsUse = {
    id: 'blueprints',
    claims: (h) => h.kind === 'item' && !!recipeOfBlueprint(h.item.item),
    takesF: () => true,
    step: (h, _dt, f) => {
      if (!f) this.armed = true;
      else if (this.armed) {
        this.armed = false;
        this.learnHeld(h);
      }
    },
    words: (h) => this.wordsOf(h),
    gone: () => {
      this.armed = false;
    },
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
  }

  private recipeOf(h: NonNullable<Held>): Recipe | null {
    return h.kind === 'item' ? recipeOfBlueprint(h.item.item) : null;
  }

  private learnHeld(h: NonNullable<Held>): void {
    const ctx = this.ctx;
    const r = this.recipeOf(h);
    if (!ctx || !r) return;
    if (!this.learn(r.id)) {
      ctx.player.flashWhy(`已经会做${r.name.zh}了`);
      return;
    }
    // the sheet is used up
    ctx.player.slots[ctx.player.sel] = null;
    ctx.sound('book_page', 0.8);
    ctx.ui.say(`学会了：${r.name.zh}。在工作台上就能做`, 3);
  }

  private wordsOf(h: NonNullable<Held>): Action[] {
    const r = this.recipeOf(h);
    if (!r) return [];
    if (this.ctx?.learned?.has(r.id)) return [{ keys: ['E'], text: `学会 <b>${r.name.zh}</b>`, off: true, why: `已经会做${r.name.zh}了` }];
    return [{ keys: ['E'], text: `学会 <b>${r.name.zh}</b>` }];
  }

  /** a making learnt (the game's own: GameContext.learn); true: new */
  learn(recipe: string): boolean {
    return this.ctx?.learn?.(recipe) ?? false;
  }
}
