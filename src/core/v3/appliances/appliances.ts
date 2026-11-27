/**
 * The things one can switch on (node M2, docs/V3/nodes/M2-rv.md): the recyclables a motorhome is furnished with —
 * a clock radio, a record player, an old television, a desk lamp, a solar lamp — work wherever
 * they are put down, in the motorhome or anywhere else, with no power to find (the player asked for none). What
 * each one is doing rides on the thing itself (ItemState.app), so it goes where the thing goes and is saved with
 * it; a thing in the hands does nothing, and goes on where it was when it is put down again.
 *
 * The drip coffee maker there was is retired (docs/V3/plan/growth.md §一 4: one coffee machine, Nomad Drive's —
 * core/v3/nd/coffee.ts); its pot is the machine's pot. Pure: no three, no DOM.
 */
import type { ItemInstance } from '../../modcar/items';
import { vinylOf } from '../nd/vinyls';

export type ApplianceKind = 'radio' | 'record' | 'tv' | 'lamp' | 'solar';

/** what an appliance is doing (JSON: it is saved with the thing) */
export interface AppState {
  /** switched on */
  on?: boolean;
  /** the station or TV channel: an index into the songs/channels */
  ch?: number;
  /** record player only (#28): the physical vinyl record currently placed on the platter */
  vinyl?: ItemInstance;
  /** record player only: playback position in seconds */
  vinylAt?: number;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** an appliance's (docs/V3/nodes/M2-rv.md) */
    app?: AppState;
  }
}

/** the coffee pot (the coffee machine's: core/v3/nd/coffee.ts) */
export const COFFEE_POT = 'coffee_pot';
/** the drip coffee maker with its pot and without, and its ground coffee: kinds retired (read as the coffee machine, its beans) */
export const COFFEE_WITH_POT = 'junk_coffee';
export const COFFEE_NO_POT = 'coffee_maker';
export const COFFEE_GROUNDS = 'coffee_grounds';

/** which appliance each kind is */
export const APPLIANCE_OF: Readonly<Record<string, ApplianceKind>> = {
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

// ------------------------------------------------------------------ what each says it is doing

/** the words for what an appliance is doing, for its card */
export function stateWords(inst: ItemInstance, songName: (ch: number) => string): string {
  const k = applianceOf(inst.item);
  const s = appOf(inst);
  switch (k) {
    case 'radio':
      return s.on ? `开着 · 「${songName(channelOf(inst))}」` : '关着';
    case 'record': {
      const v = s.vinyl ? vinylOf(s.vinyl.item) : null;
      if (!v) return '空盘（放上黑胶唱片播放）';
      return s.on ? `在放 · 《${v.title}》` : `已放 · 《${v.title}》`;
    }
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
