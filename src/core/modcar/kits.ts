/**
 * The sets (docs/V3/plan/finish.md §二 3): a thing that wants other things to be of use — the coffee machine its pot
 * and its beans, the stove its gas and a pan — comes apart down the road. Its main thing first, by itself; what goes
 * with it only after that has been picked up, a step at a time, each two to five kilometres on from where the one
 * before it was picked up — at the first place of the right sort one has not been to. Before the main thing has been
 * picked up, what goes with it is kept back everywhere (a house's own coffee pot waits); a step one drives past comes
 * again further on. What is still wanting of a set is said on the card of any of its things.
 *
 * Pure data and maths: the game says what was picked up and how far down the road one is, and is told what to add to
 * the plan of what turns up (schedule.ts PlannedFind).
 */
import { hash2, Rng } from '../math/rng';
import type { SiteKind } from '../world/sites';
import { thingKey, type PlannedFind, type ScheduledThing } from './schedule';
import type { Text } from './types';

// (a thing's key: schedule.ts thingKey — an item's id, a part's with `part:` before it, a tool's with `tool:`)
export { thingKey };

export interface KitStep {
  /** what comes at this step, together (picking up any of them is the step taken) */
  things: readonly ScheduledThing[];
  /** the sorts of place it is found at (absent: the set's own) */
  themes?: readonly SiteKind[];
  /** never before this far down the road (km): the chapter it belongs to */
  fromKm?: number;
  /** things one has other uses for (a battery, a shovel, a bucket): never kept back, wherever the set stands */
  free?: boolean;
}

export interface KitDef {
  id: string;
  name: Text;
  /** the thing that starts it */
  main: ScheduledThing;
  /** what comes after it, in order */
  steps: readonly KitStep[];
  /** the sorts of place its steps are found at */
  themes: readonly SiteKind[];
  /** what else of it a place's own keeps back until the main thing has been picked up (what it uses up, its other pieces) */
  held?: readonly string[];
}

const I = (item: string): ScheduledThing => ({ item });
const HOME: readonly SiteKind[] = ['house'];
const WORKSHOP: readonly SiteKind[] = ['garage', 'works'];

/** the sets (§二 3's table; the vehicles' own — a trailer after its hitch, a find's missing panels — are the vehicles' plan's: schedule.ts vehicleExtras) */
export const KITS: readonly KitDef[] = [
  {
    id: 'coffee',
    name: { zh: '咖啡', en: 'Coffee' },
    main: I('nd_coffee_machine'),
    steps: [{ things: [I('coffee_pot')] }, { things: [I('nd_coffee_pack')] }],
    themes: [...HOME, 'shop', 'station'],
  },
  {
    id: 'cooking',
    name: { zh: '做饭', en: 'Cooking' },
    main: I('kit_stove'),
    steps: [{ things: [I('kit_gas')] }, { things: [I('kit_pan'), I('kit_spice')] }, { things: [I('kit_pot'), I('kit_board')], fromKm: 50 }],
    themes: [...HOME, 'camp', 'shop'],
    held: ['kit_plate', 'kit_dish'],
  },
  {
    id: 'garden',
    name: { zh: '种菜', en: 'Growing' },
    main: I('nd_plant_pot'),
    steps: [{ things: [I('nd_seeds_tomato')] }, { things: [I('nd_bucket')], free: true }, { things: [I('nd_seeds_potato')] }],
    themes: [...HOME, 'camp'],
    held: ['nd_seeds_apple', 'nd_seeds_watermelon'],
  },
  {
    id: 'fishing',
    name: { zh: '钓鱼', en: 'Fishing' },
    main: I('rod_willow'),
    steps: [{ things: [I('fishing_creel')] }, { things: [I('nd_shovel')], free: true }],
    themes: ['jetty', 'camp', ...HOME],
    held: ['bait_worm', 'bait_spoon', 'bait_shrimp', 'bait_squid_strip'],
  },
  {
    id: 'treasure',
    name: { zh: '寻宝', en: 'Treasure' },
    main: I('nd_metal_detector'),
    steps: [{ things: [I('nd_key_1')] }],
    themes: [...WORKSHOP, ...HOME],
    held: ['nd_key_2'],
  },
  {
    id: 'refit',
    name: { zh: '翻新', en: 'Refitting' },
    main: I('nd_grinder'),
    steps: [{ things: [I('nd_battery')], free: true }, { things: [I('nd_polisher')], fromKm: 105 }],
    themes: [...WORKSHOP, 'station'],
  },
  {
    id: 'photo',
    name: { zh: '拍照', en: 'Photographs' },
    main: I('nd_camera'),
    steps: [{ things: [I('nd_film_pack')] }],
    themes: [...HOME, 'shop', 'lookout'],
  },
  {
    id: 'music',
    name: { zh: '音乐', en: 'Music' },
    main: { part: 'radio_old' },
    steps: [{ things: [I('nd_tape_01')] }],
    themes: [...HOME, ...WORKSHOP, 'station'],
  },
];

const KIT_BY_ID = new Map(KITS.map((k) => [k.id, k]));

export function kitDef(id: string): KitDef {
  const k = KIT_BY_ID.get(id);
  if (!k) throw new Error(`no set ${id}`);
  return k;
}

/** where a thing stands in a set: 0 its main thing, 1 its first step …; `held` for what is only kept back with it */
const PLACE = new Map<string, { kit: KitDef; index: number; free?: boolean }>();
for (const k of KITS) {
  PLACE.set(thingKey(k.main), { kit: k, index: 0 });
  k.steps.forEach((st, i) => {
    for (const t of st.things) if (!PLACE.has(thingKey(t))) PLACE.set(thingKey(t), { kit: k, index: i + 1, ...(st.free ? { free: true } : {}) });
  });
  // (what it uses up: it may be found from the first step on — once the main thing is one's own)
  for (const h of k.held ?? []) if (!PLACE.has(h)) PLACE.set(h, { kit: k, index: 1 });
}

/** the set a thing belongs to and where it stands in it, or null */
export function kitOf(key: string): { kit: KitDef; index: number; free?: boolean } | null {
  return PLACE.get(key) ?? null;
}

/** how a set stands for one game */
export interface KitState {
  /** how many of its things, in order, have been picked up: 0 none, 1 the main one, 2 its first step … */
  got: number;
  /** where its main thing was picked up (m of road): its steps are counted from there */
  main?: number;
  /** the step now out to be found: which (1 …), where it is due (m), how many times it has been put out */
  out?: { step: number; s: number; n: number };
}
export type KitsState = Record<string, KitState>;

/** how far on from where the step before was picked up the next comes (km) */
export const KIT_AFTER_KM: readonly [number, number] = [2, 5];
/** the places with a box of their own between two points of the road (m), in road order: where a step may be put */
export type PlacesAhead = (from: number, to: number) => readonly { readonly s: number; readonly kind: SiteKind }[];
/** how far past where a step was due one is before it is taken as missed and put out again (m) */
export const KIT_MISSED_M = 3000;
/**
 * A set is whole within this far of where its main thing was picked up (m; docs/V3/plan/finish.md §二 4: 每套东西从主件
 * 到凑齐不超过 15 km) — the steps of its own chapter, for one who picks each up as it comes: where the road is too
 * bare for the two-to-five kilometres between them, a step comes sooner or at whatever place there is, not later
 */
export const KIT_WHOLE_M = 15_000;
/** a place nearer than this to where one stands is one come to already: no step is put there (m) */
const KIT_NEAR_M = 400;

function stateOf(st: KitsState, id: string): KitState {
  return (st[id] ??= { got: 0 });
}

/** the finds of a set's step, due at `s` (m) */
function stepFinds(kit: KitDef, step: number, s: number, anywhere = false): PlannedFind[] {
  const def = kit.steps[step - 1];
  // (anywhere: put at a place chosen for it that is not of its sorts — it waits for none)
  return def.things.map((thing) => ({ entry: `kit:${kit.id}:${step}`, thing, s, ...(anywhere ? {} : { themes: def.themes ?? kit.themes }), novelty: false }));
}

/**
 * Puts the set's next step out, two to five kilometres on from `s` (not before its chapter): the finds to add to the
 * plan. With the places ahead known (`ahead`), at one of its own sort within those kilometres when there is one —
 * exactly there; else at the first place with a box in them; and where the road has none there, at the first after —
 * but, a step of the set's own chapter, never so far that the set would not be whole within KIT_WHOLE_M of its main
 * thing: then at the last place before that, sooner than two kilometres if it must be. Without the places, somewhere
 * in those kilometres, for the first place that takes it from there. `missed`: put out again after it was driven
 * past — its own doing: no promise then.
 */
function putOut(st: KitState, kit: KitDef, s: number, seed: number, ahead?: PlacesAhead, missed = false): PlannedFind[] {
  const step = st.got;
  if (step < 1 || step > kit.steps.length) {
    delete st.out;
    return [];
  }
  const def = kit.steps[step - 1];
  const n = st.out && st.out.step === step ? st.out.n + 1 : 0;
  const r = new Rng(hash2(seed | 0, hash2(kit.id.length * 131 + kit.id.charCodeAt(0), step, n), 0x6b17));
  const span = (KIT_AFTER_KM[1] - KIT_AFTER_KM[0]) * 1000;
  const from = Math.max(s + KIT_AFTER_KM[0] * 1000, (def.fromKm ?? 0) * 1000);
  let due = Math.max(s + KIT_AFTER_KM[0] * 1000 + span * r.next(), (def.fromKm ?? 0) * 1000);
  let anywhere = false;
  if (ahead) {
    const sorts = def.themes ?? kit.themes;
    // (by when it must be found for the set to be whole in time: its share of the way, half a kilometre in hand —
    // none for a later chapter's step, for one put out again, or where one is past it already)
    const core = kit.steps.filter((x) => x.fromKm === undefined).length;
    const by = !missed && def.fromKm === undefined && st.main !== undefined ? st.main + ((KIT_WHOLE_M - 500) * Math.min(step, core)) / core : Infinity;
    const deadline = by > s + KIT_NEAR_M ? by : Infinity;
    const to = Math.min(from + span, deadline);
    const all = ahead(s + KIT_NEAR_M, Math.max(from + span, Math.min(deadline, s + KIT_WHOLE_M))).filter((p) => p.s >= s + KIT_NEAR_M);
    const inIts = all.filter((p) => p.s >= from && p.s <= to);
    const own = inIts.filter((p) => sorts.includes(p.kind));
    // (just before it: the place takes what is due from a metre before it on)
    const at = (p: { readonly s: number }, any: boolean): void => {
      due = p.s - 0.5;
      anywhere = any;
    };
    if (own.length) at(own[Math.min(own.length - 1, Math.floor(r.next() * own.length))], false);
    else if (inIts.length) at(inIts[0], true);
    else {
      const later = all.find((p) => p.s > to && p.s <= deadline);
      const sooner = deadline < Infinity ? [...all].reverse().find((p) => p.s < from) : undefined;
      if (later) at(later, !sorts.includes(later.kind));
      else if (sooner) at(sooner, !sorts.includes(sooner.kind));
    }
  }
  st.out = { step, s: due, n };
  return stepFinds(kit, step, due, anywhere);
}

/**
 * A thing was picked up at `s` (m of road), in the game of `seed`: where it is the next of its set, the set moves on
 * and its next step is put out — the finds to add to the plan (none: nothing changed, or the set is whole).
 */
export function kitPicked(st: KitsState, key: string, s: number, seed: number, ahead?: PlacesAhead): PlannedFind[] {
  const at = kitOf(key);
  if (!at) return [];
  const k = stateOf(st, at.kit.id);
  // (only the next of it in order moves the set on: an earlier one again changes nothing, and a later one come by
  // some other way — a battery before the grinder — is not the set's doing)
  if (at.index !== k.got) return [];
  // (what is only kept back with it moves nothing on)
  const isStep = at.index === 0 || at.kit.steps[at.index - 1]?.things.some((t) => thingKey(t) === key);
  if (!isStep) return [];
  k.got = at.index + 1;
  if (at.index === 0) k.main = s;
  return putOut(k, at.kit, s, seed, ahead);
}

/**
 * One has come to `s` (m of road): every step that has not been picked up and lies more than KIT_MISSED_M back is put
 * out again further on — the finds to add to the plan. `laidAt` says where the place that took a set's step is (m;
 * undefined: no place has taken it yet — a long stretch with none: it is still ahead, and is not missed); without it a
 * step is taken to lie where it was due.
 */
export function kitsPassed(st: KitsState, s: number, seed: number, laidAt?: (kit: string, step: number) => number | undefined, ahead?: PlacesAhead): PlannedFind[] {
  const out: PlannedFind[] = [];
  for (const kit of KITS) {
    const k = st[kit.id];
    if (!k?.out || k.out.step !== k.got) continue;
    const at = laidAt ? laidAt(kit.id, k.out.step) : k.out.s;
    if (at === undefined || s < at + KIT_MISSED_M) continue;
    out.push(...putOut(k, kit, s, seed, ahead, true));
  }
  return out;
}

/** is this thing kept back for now — a piece of a set whose earlier pieces have not been picked up yet? */
export function kitHeld(st: KitsState, key: string): boolean {
  const at = kitOf(key);
  if (!at || at.index === 0 || at.free) return false;
  return (st[at.kit.id]?.got ?? 0) < at.index;
}

/** has the set's main thing been picked up already (another of it down the road is one too many)? */
export function kitBegun(st: KitsState, key: string): boolean {
  const at = kitOf(key);
  return !!at && at.index === 0 && (st[at.kit.id]?.got ?? 0) >= 1;
}

/**
 * What is still wanting of the set a thing belongs to, for its card (docs/V3/plan/finish.md §二 3: 还缺……): the keys of
 * its main thing and its steps' things that `has` says one has not got, in the set's order. Null: the thing is of no
 * set; an empty list: the set is whole.
 */
export function kitWanting(key: string, has: (key: string) => boolean): { kit: KitDef; wanting: string[] } | null {
  const at = kitOf(key);
  if (!at) return null;
  const all = [thingKey(at.kit.main), ...at.kit.steps.flatMap((s) => s.things.map(thingKey))];
  return { kit: at.kit, wanting: all.filter((k) => !has(k)) };
}
