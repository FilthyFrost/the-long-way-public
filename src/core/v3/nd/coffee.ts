/**
 * The coffee machine's rules (docs/ND/PLAN.md, Nomad Drive's coffee machine and coffee refill area as the game
 * has them): a bag of coffee poured into its hopper (E held a second with the bag in the hands, whenever the hopper is
 * not full: it is full then, the bag gone; its lid swings open by itself while one looks at the hopper and shuts
 * again after), a cup put under its spout (a mug, a coffee pot), the switch pressed: it brews for 7.5 s, then the
 * coffee runs into the cup at 0.5 L/s — as much as the hopper still has or the cup still takes, whichever is less.
 * It asks for no water and no power, and no lid shut (Nomad Drive's asks for none of them). Its state rides on the
 * machine (ItemState.ndCoffee), the cup on it with it.
 * Pure: no three, no DOM.
 */
import { itemDef, type ItemInstance } from '../../modcar/items';

export const ND_COFFEE = {
  /** a bag poured in (s) */
  pourS: 1,
  /** what a bag is good for (L of coffee) */
  bag: 1,
  /** brewing (s), then the flow into the cup (L/s) */
  brewS: 7.5,
  flow: 0.5,
} as const;

export interface NdCoffeeState {
  /** the coffee in its hopper, as litres it is still good for */
  fill?: number;
  /** the cup under its spout (it goes with the machine) */
  cup?: ItemInstance;
  /** brewing: seconds since the switch; pouring: litres still to run into the cup */
  brew?: number;
  pour?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** the ND coffee machine's (docs/ND/PLAN.md) */
    ndCoffee?: NdCoffeeState;
  }
}

const NONE: Readonly<NdCoffeeState> = {};

export function coffeeOf(m: ItemInstance): Readonly<NdCoffeeState> {
  return m.state?.ndCoffee ?? NONE;
}

function st(m: ItemInstance): NdCoffeeState {
  m.state ??= {};
  return (m.state.ndCoffee ??= {});
}

/** a cup it takes under its spout: a thing one drinks coffee from (a mug, a coffee pot) */
export function isCup(inst: ItemInstance): boolean {
  const d = itemDef(inst.item).drink;
  return !!d && d.liquid === 'coffee';
}

/** how much more the cup takes (L) */
export function cupRoom(cup: ItemInstance): number {
  const d = itemDef(cup.item).drink;
  return d ? Math.max(0, d.litres - (cup.litres ?? 0)) : 0;
}

/** busy: brewing or pouring */
export function working(m: ItemInstance): boolean {
  const s = coffeeOf(m);
  return s.brew !== undefined || s.pour !== undefined;
}

/** what it still lacks before it can brew ('' nothing) */
export type CoffeeLack = 'cup' | 'coffee' | 'full' | 'busy' | '';

export function coffeeLack(m: ItemInstance): CoffeeLack {
  const s = coffeeOf(m);
  if (working(m)) return 'busy';
  if (!s.cup) return 'cup';
  if ((s.fill ?? 0) <= 1e-4) return 'coffee';
  if (cupRoom(s.cup) <= 1e-4) return 'full';
  return '';
}

/** the hopper takes a bag (it is not full, not brewing) */
export function takesBag(m: ItemInstance): boolean {
  return (coffeeOf(m).fill ?? 0) < ND_COFFEE.bag - 1e-4 && !working(m);
}

/** a bag poured in: the hopper full (true when it took it) */
export function pourBag(m: ItemInstance): boolean {
  if (!takesBag(m)) return false;
  st(m).fill = ND_COFFEE.bag;
  return true;
}

/** a cup put under its spout (none there yet): true when it went */
export function putCup(m: ItemInstance, cup: ItemInstance): boolean {
  const s = st(m);
  if (s.cup || !isCup(cup) || working(m)) return false;
  s.cup = cup;
  return true;
}

/** the cup taken from under its spout (null: none, or still pouring) */
export function takeCup(m: ItemInstance): ItemInstance | null {
  const s = st(m);
  if (!s.cup || s.pour !== undefined) return null;
  const c = s.cup;
  delete s.cup;
  return c;
}

/** the switch: brewing begins (true) if nothing lacks */
export function startBrew(m: ItemInstance): boolean {
  if (coffeeLack(m)) return false;
  st(m).brew = 0;
  return true;
}

/** a step of brewing and pouring: what ran into the cup this step (L), and whether it has just finished */
export function coffeeStep(m: ItemInstance, dt: number): { ran: number; done: boolean; poured: boolean } {
  const s = st(m);
  let ran = 0;
  let poured = false;
  if (s.brew !== undefined) {
    s.brew += dt;
    if (s.brew < ND_COFFEE.brewS) return { ran, done: false, poured };
    // brewed: the coffee runs (as much as the hopper has or the cup takes)
    dt = s.brew - ND_COFFEE.brewS;
    delete s.brew;
    const want = Math.min(s.fill ?? 0, s.cup ? cupRoom(s.cup) : 0);
    if (want <= 1e-5) return { ran, done: true, poured };
    s.pour = want;
    poured = true;
  }
  if (s.pour !== undefined) {
    const d = Math.min(s.pour, ND_COFFEE.flow * dt);
    s.pour -= d;
    s.fill = Math.max(0, (s.fill ?? 0) - d);
    if (s.cup) s.cup.litres = (s.cup.litres ?? 0) + d;
    ran = d;
    if (s.pour <= 1e-6) {
      delete s.pour;
      if ((s.fill ?? 0) <= 1e-4) delete s.fill;
      return { ran, done: true, poured };
    }
  }
  return { ran, done: false, poured };
}
