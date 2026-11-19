/**
 * What is drawn of the stations (node C1). (Filled in by the models' step: the fire, the pot and what is in
 * it, steam and smoke, the kitchen corner.)
 */
import type { GameContext } from '../../kernel/context';
import type { Cooking, CookShow } from './system';

export class CookView implements CookShow {
  constructor(ctx: GameContext, c: Cooking) {
    void ctx;
    void c;
  }

  update(dt: number, ctx: GameContext, c: Cooking): void {
    void dt;
    void ctx;
    void c;
  }

  dispose(): void {}
}
