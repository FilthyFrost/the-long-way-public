/**
 * The things one can switch on (node M2, docs/V3/nodes/M2-rv.md): the recyclables a motorhome is furnished with —
 * a drip coffee maker, a clock radio, a record player, an old television, a desk lamp, a solar lamp — work wherever
 * they are put down, in the motorhome or anywhere else, with no power to find (the player asked for none). What
 * each one is doing rides on the thing itself (ItemState.app), so it goes where the thing goes and is saved with
 * it; a thing in the hands does nothing, and goes on where it was when it is put down again.
 *
 * The coffee maker: water poured into its tank (from a bottle of water or the water bottle), a portion of ground
 * coffee into its filter (from a bag of it), its pot on the hotplate; switched on, the water drips through into the
 * pot, some forty seconds for a full tank, and it switches itself off when the tank is dry or the pot full, the
 * grounds spent. The pot taken off, it is a coffee pot in the hands, drunk from as a bottle is (coffee: vitals.ts);
 * the machine stands there without it. Pure: no three, no DOM.
 */
import { itemDef, newItem, type ItemInstance } from '../../modcar/items';

export type ApplianceKind = 'coffee' | 'radio' | 'record' | 'tv' | 'lamp' | 'solar';

/** what an appliance is doing (JSON: it is saved with the thing) */
export interface AppState {
  /** switched on (the coffee maker: brewing) */
  on?: boolean;
  /** the station, the channel, the record: an index into the songs (radio.ts SONGS) */
  ch?: number;
  /** the coffee maker: litres in its tank, a portion of grounds in its filter (1) or none, the coffee in its pot (L) */
  water?: number;
  grounds?: number;
  coffee?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** an appliance's (docs/V3/nodes/M2-rv.md) */
    app?: AppState;
  }
}

/** the coffee maker with its pot on its hotplate, and without; the pot alone; a bag of ground coffee */
export const COFFEE_WITH_POT = 'junk_coffee';
export const COFFEE_NO_POT = 'coffee_maker';
export const COFFEE_POT = 'coffee_pot';
export const COFFEE_GROUNDS = 'coffee_grounds';

/** which appliance each kind is */
export const APPLIANCE_OF: Readonly<Record<string, ApplianceKind>> = {
  [COFFEE_WITH_POT]: 'coffee',
  [COFFEE_NO_POT]: 'coffee',
  junk_clockradio: 'radio',
  junk_record: 'record',
  junk_tv: 'tv',
  junk_lamp: 'lamp',
  junk_solar_lamp: 'solar',
};

/** the appliance a kind is, null: none */
export function applianceOf(id: string): ApplianceKind | null {
  return APPLIANCE_OF[id] ?? null;
}

export const COFFEE = {
  /** what its tank holds (L) */
  tank: 1,
  /** what its pot holds (L) */
  pot: 1,
  /** how fast the water drips through (L/s): a full tank in some forty seconds */
  rate: 0.025,
} as const;

/** how many stations a set finds, channels a television, records a record player has (radio.ts has as many songs) */
export const CHANNELS = 5;

const NONE: Readonly<AppState> = {};

/** what the thing is doing, to read (nothing written into it) */
export function appOf(inst: ItemInstance): Readonly<AppState> {
  return inst.state?.app ?? NONE;
}

/** what the thing is doing, to change: its state made when it has none */
export function appState(inst: ItemInstance): AppState {
  inst.state ??= {};
  return (inst.state.app ??= {});
}

/** switched on, or off (`on` absent: the other way); what it is now */
export function toggle(inst: ItemInstance, on?: boolean): boolean {
  const s = appState(inst);
  const want = on ?? !s.on;
  if (want) s.on = true;
  else delete s.on;
  return want;
}

/** the next station, channel or record; which one it is now */
export function nextChannel(inst: ItemInstance): number {
  const s = appState(inst);
  s.ch = ((s.ch ?? 0) + 1) % CHANNELS;
  return s.ch;
}

/** the station, channel or record it is on (a record player found with a record on it: the one its uid says) */
export function channelOf(inst: ItemInstance): number {
  const ch = appOf(inst).ch;
  if (ch !== undefined) return ((ch % CHANNELS) + CHANNELS) % CHANNELS;
  let h = 0;
  for (let i = 0; i < inst.uid.length; i++) h = (h * 31 + inst.uid.charCodeAt(i)) | 0;
  return ((h % CHANNELS) + CHANNELS) % CHANNELS;
}

// ------------------------------------------------------------------ the coffee maker

/** its pot is on it */
export function hasPot(inst: ItemInstance): boolean {
  return inst.item === COFFEE_WITH_POT;
}

/** what the coffee maker still needs before it can brew ('' nothing: it can) */
export type BrewLack = 'pot' | 'water' | 'grounds' | 'full' | '';

export function brewLack(inst: ItemInstance): BrewLack {
  const s = appOf(inst);
  if (!hasPot(inst)) return 'pot';
  if ((s.water ?? 0) < 0.01) return 'water';
  if (!s.grounds) return 'grounds';
  if ((s.coffee ?? 0) >= COFFEE.pot - 0.01) return 'full';
  return '';
}

/** it begins to brew (true), or cannot (brewLack says why) */
export function startBrew(inst: ItemInstance): boolean {
  if (brewLack(inst)) return false;
  appState(inst).on = true;
  return true;
}

/**
 * One step of a coffee maker that is on: the water drips through into the pot. When the tank is dry or the pot
 * full it switches itself off and the grounds are spent (`done`). `dripped`: litres this step.
 */
export function brewStep(inst: ItemInstance, dt: number): { dripped: number; done: boolean } {
  const s = appState(inst);
  if (!s.on) return { dripped: 0, done: false };
  // (the pot taken off while it brewed: it stops)
  if (!hasPot(inst)) {
    delete s.on;
    return { dripped: 0, done: true };
  }
  const water = s.water ?? 0;
  const coffee = s.coffee ?? 0;
  const d = Math.max(0, Math.min(water, COFFEE.rate * Math.max(0, dt), COFFEE.pot - coffee));
  // (not rounded: a frame's drip is under a millilitre)
  s.water = water - d;
  s.coffee = coffee + d;
  if (s.water < 0.001 || s.coffee >= COFFEE.pot - 0.001) {
    delete s.on;
    delete s.grounds;
    if (s.water < 0.001) delete s.water;
    else s.water = round3(s.water);
    s.coffee = round3(s.coffee);
    return { dripped: d, done: true };
  }
  return { dripped: d, done: false };
}

/** water poured into the tank from a source that has `have` litres: how much went in */
export function pourWater(inst: ItemInstance, have: number): number {
  const s = appState(inst);
  const w = s.water ?? 0;
  const d = Math.max(0, Math.min(have, COFFEE.tank - w));
  if (d <= 0) return 0;
  s.water = round3(w + d);
  return d;
}

/** a portion of ground coffee into the filter from a bag (its uses down by one): false when the filter has one */
export function addGrounds(inst: ItemInstance, bag: ItemInstance): boolean {
  const s = appState(inst);
  if (s.grounds || (bag.uses ?? 0) <= 0) return false;
  s.grounds = 1;
  bag.uses = (bag.uses ?? 0) - 1;
  return true;
}

/**
 * The pot taken off the coffee maker: the machine becomes the one without (the same thing, another kind: drawn
 * again), the pot a coffee pot with the coffee that was in it. A brew going on stops.
 */
export function takePot(inst: ItemInstance): ItemInstance {
  const s = appState(inst);
  const pot = newItem(COFFEE_POT, { litres: round3(Math.min(itemDef(COFFEE_POT).drink?.litres ?? COFFEE.pot, s.coffee ?? 0)) });
  delete s.coffee;
  delete s.on;
  inst.item = COFFEE_NO_POT;
  return pot;
}

/** a coffee pot put back on its hotplate: its coffee in the machine's pot from now on, the machine the one with it */
export function putPot(inst: ItemInstance, pot: ItemInstance): void {
  const s = appState(inst);
  const l = round3(pot.litres ?? 0);
  if (l > 0) s.coffee = l;
  else delete s.coffee;
  inst.item = COFFEE_WITH_POT;
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ------------------------------------------------------------------ what each says it is doing

/** the words for what an appliance is doing, for its card */
export function stateWords(inst: ItemInstance, songName: (ch: number) => string): string {
  const k = applianceOf(inst.item);
  const s = appOf(inst);
  switch (k) {
    case 'coffee': {
      if (s.on) return '正在煮';
      const pot = hasPot(inst) ? ((s.coffee ?? 0) > 0.01 ? `壶里 ${(s.coffee ?? 0).toFixed(2)} L 咖啡` : '壶是空的') : '没有咖啡壶';
      return pot;
    }
    case 'radio':
      return s.on ? `开着 · 「${songName(channelOf(inst))}」` : '关着';
    case 'record':
      return s.on ? `在放 · 「${songName(channelOf(inst))}」` : '停着';
    case 'tv':
      return s.on ? `开着 · 第 ${channelOf(inst) + 1} 台` : '关着';
    case 'lamp':
      return s.on ? '开着' : '关着';
    case 'solar':
      return s.on ? '开着：天黑了就亮' : '关着';
    default:
      return '';
  }
}
