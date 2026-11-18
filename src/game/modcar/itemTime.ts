/**
 * The world's time as things that go off need it (docs/V3/nodes/N0-items.md): the world clock's seconds, for
 * freshNow, stampFresh, mergeStacks, putInside and takeInside (src/core/modcar/items.ts), without every host
 * interface between the game and its parts having to carry a clock.
 *
 * The game sets it once, when it is made (ModGame); a test's stand-in for the game sets its own. Before that
 * the time is 0, which is also what a new game starts at.
 */

let clock: { readonly worldSeconds: number } | null = null;

/** the clock things go off by (null: none, the time reads 0) */
export function setItemClock(c: { readonly worldSeconds: number } | null): void {
  clock = c;
}

/** now, in the world clock's seconds */
export function itemNow(): number {
  return clock ? clock.worldSeconds : 0;
}
