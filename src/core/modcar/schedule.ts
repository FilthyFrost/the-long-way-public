/**
 * When the new things first turn up down the road (docs/V3/plan/growth.md §六 3–6, J8): each has its own schedule — the
 * kilometres it first appears between, how far apart it comes again after that, the sorts of place it is found at
 * (three times as likely at one of them, and a planned one waits up to 600 m for one) — and what goes with it: a thing
 * that comes in the same box (a pan with the stove, three in four times), a thing guaranteed within so many kilometres
 * after it (the stove's gas within 2–6 km). Besides the new things, the supplies that keep one going come on a
 * schedule of their own (a can of petrol every 5 km or so, a tyre kit every 2.5 km), their spacing shortened or
 * stretched by the difficulty (more on the comfortable one, less on the hard one).
 *
 * The plan is a pure function of the world's seed: every new game of that world finds the same things at the same
 * places. Pure data and maths.
 */
import { hash2, Rng } from '../math/rng';
import type { SiteKind } from '../world/sites';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { frameDef } from './frames';
import { foundLayout } from './wrecks';

/** what is found: an item by id, a tool of a kind (with what the tool's maker takes), a part */
export type ScheduledThing = { item: string } | { tool: 'jerrycan' | 'bottle' | 'oilcan' | 'spray'; coolant?: boolean; litres?: number } | { part: string; shapeOf?: string };

export interface ScheduleEntry {
  /** its name in the plan (the novelty's own: 'stove', 'coffee', 'fuel') */
  id: string;
  thing: ScheduledThing;
  /** a new thing (counted by the pace: at most one in any ten minutes' drive) or a supply */
  novelty: boolean;
  /** first appears between these kilometres */
  firstKm: readonly [number, number];
  /** then again every so many kilometres (absent: once) */
  everyKm?: readonly [number, number];
  /** the sorts of place it is found at (absent: any) */
  themes?: readonly SiteKind[];
  /** what may come in the same box, and how likely */
  with?: readonly { thing: ScheduledThing; chance: number }[];
  /** what is guaranteed within so many kilometres after its first (the stove's gas) */
  after?: readonly { thing: ScheduledThing; km: readonly [number, number] }[];
  /** a can's litres, between these, each find its own */
  litres?: readonly [number, number];
}

const I = (item: string): ScheduledThing => ({ item });

/** the houses, cabins and the motel: where a home's things are */
const HOME: readonly SiteKind[] = ['house'];
const STATION: readonly SiteKind[] = ['station'];
const WORKSHOP: readonly SiteKind[] = ['garage', 'works'];
const SHOP: readonly SiteKind[] = ['shop', 'station'];
const CAMP: readonly SiteKind[] = ['camp', 'jetty'];

/**
 * The new things (§六 3's table) and the supplies (§六 4, 6). Where the plan names a thing the game has two of, the
 * Nomad Drive one (重复的东西以 ND 为主); what the game has not got yet (the two-burner camp stove, the four-burner
 * range, the fishing rod's module) is left out until it has.
 */
export const SCHEDULE: readonly ScheduleEntry[] = [
  // ---- 0–3 km: a crowbar, painkillers, a torch
  { id: 'crowbar', thing: I('nd_crowbar'), novelty: true, firstKm: [0.5, 3], everyKm: [25, 40], themes: WORKSHOP },
  { id: 'torch', thing: I('nd_flashlight'), novelty: true, firstKm: [0.5, 3], everyKm: [20, 35], themes: [...WORKSHOP, 'station'], after: [{ thing: I('nd_battery'), km: [3, 6] }] },
  // ---- 3–8 km: the kits, the first-aid pack (things to keep going with: not counted by the pace)
  { id: 'engine_kit', thing: I('nd_engine_kit'), novelty: false, firstKm: [3, 8], everyKm: [10, 16], themes: WORKSHOP },
  { id: 'charger', thing: I('nd_charger'), novelty: false, firstKm: [3, 8], everyKm: [14, 22], themes: [...WORKSHOP, 'station'] },
  { id: 'bandage', thing: I('med_bandage'), novelty: false, firstKm: [3, 8], everyKm: [12, 20], themes: [...HOME, 'shop'] },
  // ---- 1–4 km: the roof rack's blueprint at the first big place, another every 10–15 km (§六 2: 升级图纸, Nomad Drive's)
  { id: 'roof_rack', thing: I('bp_roof_rack'), novelty: false, firstKm: [1, 4], everyKm: [10, 15], themes: [...WORKSHOP, 'station', 'shop', 'house'] },
  // ---- 5–10 km: the cassette stove (a pan or a pot with it, gas soon after)
  {
    id: 'stove',
    thing: I('kit_stove'),
    novelty: true,
    firstKm: [5, 10],
    everyKm: [30, 50],
    themes: [...HOME, ...CAMP],
    with: [
      { thing: I('kit_pan'), chance: 0.75 },
      { thing: I('kit_pot'), chance: 0.75 },
    ],
    after: [{ thing: I('kit_gas'), km: [2, 6] }],
  },
  // ---- 5–15 km: a radio (a tape later)
  { id: 'radio', thing: { part: 'radio_old' }, novelty: true, firstKm: [5, 15], everyKm: [30, 50], themes: [...WORKSHOP, ...HOME], after: [{ thing: I('nd_tape_01'), km: [2, 6] }] },
  // ---- 8–15 km: the coffee machine with its pot (beans and a mug after it)
  {
    id: 'coffee',
    thing: I('nd_coffee_machine'),
    novelty: true,
    firstKm: [8, 15],
    everyKm: [40, 60],
    themes: HOME,
    with: [{ thing: I('coffee_pot'), chance: 1 }],
    after: [
      { thing: I('nd_coffee_pack'), km: [2, 6] },
      { thing: I('nd_mug'), km: [2, 6] },
    ],
  },
  // ---- 10–18 km: the instant camera (with its pack of film; more film later)
  { id: 'camera', thing: I('nd_camera'), novelty: true, firstKm: [10, 18], everyKm: [50, 80], themes: [...HOME, 'lookout', 'lighthouse'], after: [{ thing: I('nd_film_pack'), km: [3, 8] }] },
  // ---- 10–20 km: a flower pot (the seeds after it)
  { id: 'pot', thing: I('nd_plant_pot'), novelty: true, firstKm: [10, 20], everyKm: [25, 40], themes: HOME, after: [{ thing: I('nd_seeds_tomato'), km: [2, 6] }] },
  // ---- 12–20 km: the metal detector (a shovel after it; what it finds wants keys)
  { id: 'detector', thing: I('nd_metal_detector'), novelty: true, firstKm: [12, 20], everyKm: [60, 90], themes: [...WORKSHOP, 'house'], after: [{ thing: I('nd_shovel'), km: [2, 6] }] },
  // ---- 15–25 km: a bigger backpack
  { id: 'pack', thing: I('pack_std'), novelty: true, firstKm: [15, 25], everyKm: [40, 60], themes: [...HOME, ...CAMP] },
  // ---- 20–30 km: the kitchen's second batch (the steamer, the kettle)
  { id: 'kitchen2', thing: I('kit_kettle'), novelty: true, firstKm: [20, 30], everyKm: [40, 60], themes: HOME, with: [{ thing: I('kit_steamer'), chance: 0.6 }] },
  // ---- 25–40 km: the grinder (a battery after it)
  { id: 'grinder', thing: I('nd_grinder'), novelty: true, firstKm: [25, 40], everyKm: [50, 70], themes: WORKSHOP, after: [{ thing: I('nd_battery'), km: [2, 6] }] },
  // ---- 30–45 km: the polisher, spray cans
  { id: 'polisher', thing: I('nd_polisher'), novelty: true, firstKm: [30, 45], everyKm: [50, 70], themes: WORKSHOP },
  { id: 'spray', thing: { tool: 'spray' }, novelty: true, firstKm: [30, 45], everyKm: [6, 10], themes: [...WORKSHOP, 'station'] },
  // ---- 40–60 km: furniture (room for it comes with the bigger vehicles)
  { id: 'furniture', thing: I('nd_chair'), novelty: true, firstKm: [40, 60], everyKm: [10, 16], themes: HOME, with: [{ thing: I('nd_table'), chance: 0.5 }] },
  { id: 'shelves', thing: I('nd_wall_shelf'), novelty: true, firstKm: [45, 65], everyKm: [15, 25], themes: HOME },
  // ---- 50–70 km: the fridge
  { id: 'fridge', thing: I('nd_fridge'), novelty: true, firstKm: [50, 70], everyKm: [60, 90], themes: HOME },
  // ---- 60 km on: what one collects
  { id: 'bobble', thing: I('nd_bobble_1'), novelty: true, firstKm: [60, 80], everyKm: [20, 35], themes: [...HOME, 'shop'] },

  // ---- the supplies (§六 4, 6), as J10 balanced them with what is left in the places' own boxes (loot.ts PLACES_KEEP):
  // over a hundred kilometres at Nomad Drive's pace of play, food 2.5 times what one eats, water twice, petrol to carry
  // 2.6 times what our car burns (27 L), never more than 8.2 km without any (the cans, the pumps, the wrecks' tanks)
  // (the petrol: any place, a can left by a wreck by the road too)
  { id: 'fuel', thing: { tool: 'jerrycan' }, novelty: false, firstKm: [1, 3], everyKm: [2.5, 4], litres: [0.8, 1.8] },
  { id: 'tyre_kit', thing: I('nd_tire_kit'), novelty: false, firstKm: [2, 4], everyKm: [2, 3], themes: [...WORKSHOP, 'station', 'roadside'] },
  { id: 'coolant', thing: { tool: 'bottle', coolant: true }, novelty: false, firstKm: [3, 6], everyKm: [50, 80], themes: [...STATION, ...WORKSHOP], litres: [1, 2.5] },
  { id: 'oil', thing: { tool: 'oilcan' }, novelty: false, firstKm: [4, 8], everyKm: [60, 100], themes: [...STATION, ...WORKSHOP], litres: [1.5, 3] },
  { id: 'painkillers', thing: I('med_pain_2'), novelty: false, firstKm: [1, 3], everyKm: [5, 9], themes: [...HOME, ...SHOP] },
  { id: 'stomach', thing: I('med_stomach'), novelty: false, firstKm: [4, 9], everyKm: [8, 14], themes: [...HOME, ...SHOP] },
  { id: 'water', thing: I('drink_water'), novelty: false, firstKm: [0.5, 2], everyKm: [12, 20], themes: [...SHOP, ...HOME, ...CAMP] },
  { id: 'food', thing: I('nd_baked_beans'), novelty: false, firstKm: [0.5, 2], everyKm: [3, 5], themes: [...SHOP, ...HOME, ...CAMP] },

  // ---- 4.5–9 km: the ladder's blueprint (§六 2: 升级图纸 — 车顶行李架和梯子), at a big place soon after the rack's (its
  // first band after the rack's: not at the rack's place and in its box every time), then every 10–15 km as the rack's
  // (J9e; the big places a vehicle is found at, the camps too; last in the list: an entry's draws are by its place in
  // it, and those before keep theirs)
  { id: 'ladder', thing: I('bp_ladder'), novelty: false, firstKm: [4.5, 9], everyKm: [10, 15], themes: [...WORKSHOP, 'station', 'shop', 'house', 'camp'] },
];

/** a vehicle to find: of which sort, the tier of the parts beside it, its own roll's seed (core/modcar/wrecks.ts rollFound) */
export interface VehiclePlanned extends PlannedFind {
  frame: string;
  tier: number;
  seed: number;
}

/** the big places a vehicle to find stands at (a yard, a forecourt, a shop's, a house's, a camp's ground) */
export const VEHICLE_PLACES: readonly SiteKind[] = ['garage', 'works', 'station', 'shop', 'house', 'camp'];

/**
 * The vehicles one finds before the 100th kilometre (§六 2's table): the first a Loaf or a Mule, then the Swallow, then
 * a second of the bigger ones, then the Whale with better parts, then the Tadpole, a trailer (J9d: a hitch ball for it a
 * few kilometres before it, vehicleExtras) — each its first kilometres
 */
export const VEHICLE_STEPS: readonly { km: readonly [number, number]; frames: readonly string[]; tier: number }[] = [
  { km: [12, 20], frames: ['van', 'pickup'], tier: 2 },
  { km: [25, 40], frames: ['moto'], tier: 2 },
  { km: [30, 45], frames: ['buffalo', 'wagon', 'goat', 'fox'], tier: 2 },
  { km: [50, 70], frames: ['rv', 'turtle'], tier: 3 },
  { km: [75, 100], frames: ['trailer'], tier: 2 },
];

/** from the 100th kilometre: one every 15–20 km, the Rhino, the Snail, the Old Elephant and the Camel first (docs/V3/plan/rv.md), then all of them in turn */
const LATER_FROM_KM = 100;
const LATER_FIRST: readonly string[] = ['rhino', 'snail', 'elephant', 'camel'];
const LATER_ALL: readonly string[] = ['van', 'pickup', 'moto', 'buffalo', 'wagon', 'goat', 'fox', 'rv', 'rhino', 'snail', 'turtle', 'elephant', 'camel'];

/** two vehicles to find at least so far apart (km) */
const VEHICLE_GAP_KM = 5;

/**
 * The vehicles to find down a world's road (§六 2): the table's four before the 100th kilometre, then one every 15–20
 * km, never the same sort twice running — each at the first big place soon after it is due (wrecks.ts VehicleFinds: a
 * bare frame standing on its ground, a set of parts beside it); one gets in and makes it one's own. The wrecks by the
 * road are for their parts.
 */
export function vehiclePlan(seed: number, toKm: number): VehiclePlanned[] {
  const r = new Rng(hash2(seed | 0, 0x7e41c, 2));
  const out: VehiclePlanned[] = [];
  const add = (km: number, frame: string, tier: number): void => {
    out.push({ entry: `vehicle:${frame}`, thing: { item: 'vehicle' }, s: km * 1000, themes: VEHICLE_PLACES, novelty: true, frame, tier, seed: hash2(seed | 0, out.length, 0x7e41d) });
  };
  let last = -Infinity;
  for (const st of VEHICLE_STEPS) {
    const km = Math.max(st.km[0] + (st.km[1] - st.km[0]) * r.next(), last + VEHICLE_GAP_KM);
    const frame = st.frames[r.int(st.frames.length)];
    last = km;
    if (km < toKm) add(km, frame, st.tier);
  }
  let prev = out[out.length - 1]?.frame ?? '';
  for (let k = 0, km = Math.max(LATER_FROM_KM, last + 15) + 5 * r.next(); km < toKm; k++, km += 15 + 5 * r.next()) {
    let frame = k < LATER_FIRST.length ? LATER_FIRST[k] : LATER_ALL[r.int(LATER_ALL.length)];
    if (frame === prev) frame = LATER_ALL[(LATER_ALL.indexOf(frame) + 1 + r.int(LATER_ALL.length - 1)) % LATER_ALL.length];
    prev = frame;
    add(km, frame, 3);
  }
  return out;
}

/**
 * The panels missing from each vehicle to find (its roll's `missing`), each coming 2–6 km after where the vehicle is due
 * (§六 2: 缺的 2–6 km 后补上) — at a workshop, a filling station, a house or a shop, shaped for its frame; a trailer's
 * hitch ball 3–8 km before it, at a workshop or a filling station (what tows it, on whatever one drives); the
 * motorcycle rack's blueprint 2–5 km after the motorcycle (§六 2: 摩托车架跟着摩托车出现, J9e), at the big places a
 * blueprint is found at
 */
export function vehicleExtras(seed: number, toKm: number): PlannedFind[] {
  const out: PlannedFind[] = [];
  for (const v of vehiclePlan(seed, toKm)) {
    const r = new Rng(hash2(v.seed, 0x7e41e, 3));
    if (frameDef(v.frame).towed) out.push({ entry: 'vehicle+', thing: { part: 'hitch_ball' }, s: Math.max(1000, v.s - (3 + 5 * r.next()) * 1000), themes: ['garage', 'works', 'station'], novelty: false });
    // (its own draw: the panels' after it keep theirs)
    if (frameDef(v.frame).balance) out.push({ entry: 'moto_rack', thing: { item: 'bp_moto_rack' }, s: v.s + (2 + 3 * new Rng(hash2(v.seed, 0xb1e9, 5)).next()) * 1000, themes: ['garage', 'works', 'station', 'shop', 'house'], novelty: false });
    for (const m of foundLayout(v.frame, v.seed).missing) {
      out.push({ entry: 'vehicle+', thing: { part: m.part, shapeOf: v.frame }, s: v.s + (2 + 4 * r.next()) * 1000, themes: ['garage', 'works', 'station', 'house', 'shop'], novelty: false });
    }
  }
  return out;
}

/** the plan the places lay (places.ts): the things (plan) and the panels missing from the vehicles to find, by where each is due */
export function placesPlan(seed: number, toKm: number, difficulty: Difficulty = 'normal'): PlannedFind[] {
  return [...plan(seed, toKm, difficulty), ...vehicleExtras(seed, toKm)].sort((a, b) => a.s - b.s);
}

/**
 * What stands for a new thing among a place's own (heldBackUntil): the other bobbleheads for the first; the hiking pack,
 * a bigger one than the plan's canvas rucksack, for it
 */
const HELD_KIN: Readonly<Record<string, string>> = { nd_bobble_2: 'nd_bobble_1', nd_bobble_3: 'nd_bobble_1', nd_bobble_4: 'nd_bobble_1', pack_hike: 'pack_std' };
/** the new things that are a building's furnishing (its table and chairs, its shelf, its kitchen's fridge): never held back */
const FURNISHING: ReadonlySet<string> = new Set(['furniture', 'shelves', 'fridge']);

/**
 * How far down the road a place's own may first have each of the new things (§六 3: 新东西按里程放出): where the plan's
 * first of it is due (m), by item — a Nomad Drive building's own (core/v3/nd/cards.ts: a cabin's coffee machine and its
 * camera, a filling station's store room's grinder) waits for it and for the THEME_WAIT_M it may wait for its place
 * (places.ts), so that the new things come one at a time as the plan has them; after it they may be anywhere as Nomad
 * Drive has them. The furniture is the buildings' furnishing and waits for nothing. `finds` the places' plan in road
 * order (placesPlan).
 */
export function heldBackUntil(finds: readonly PlannedFind[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const f of finds) if (f.novelty && !FURNISHING.has(f.entry) && 'item' in f.thing && !out.has(f.thing.item)) out.set(f.thing.item, f.s);
  for (const [kin, of] of Object.entries(HELD_KIN)) {
    const s = out.get(of);
    if (s !== undefined && !out.has(kin)) out.set(kin, s);
  }
  return out;
}

/** a planned find: what, at how far down the road (m) it is due, and which entry it is of */
export interface PlannedFind {
  entry: string;
  thing: ScheduledThing;
  /** due here (m): the first place it fits at or after this takes it */
  s: number;
  /** the sorts of place it wants (absent: any) */
  themes?: readonly SiteKind[];
  novelty: boolean;
  /** what comes in the same box */
  with?: ScheduledThing[];
}

/**
 * a novelty pushed later when another came too close before it (§六 3: at most one new thing in any ten minutes — of
 * play, the stops at the places with it: about three and a half kilometres of road)
 */
export const NOVELTY_GAP_KM = 3.5;

/**
 * The plan of what turns up down a world's road as far as `toKm`: each entry's finds (its first in its band, then
 * again at its spacing, the spacing of the supplies by the difficulty's), the novelties spaced at least NOVELTY_GAP_KM
 * apart (a later one pushed on), what comes after one guaranteed within its kilometres, and what comes with one in the
 * same box rolled now. Sorted by where each is due.
 */
export function plan(seed: number, toKm: number, difficulty: Difficulty = 'normal'): PlannedFind[] {
  const out: PlannedFind[] = [];
  const supply = DIFFICULTY[difficulty].supply;
  const firsts: { e: ScheduleEntry; km: number }[] = [];
  SCHEDULE.forEach((e, i) => {
    const r = new Rng(hash2(seed | 0, 0x5c4ed, i));
    let km = e.firstKm[0] + (e.firstKm[1] - e.firstKm[0]) * r.next();
    firsts.push({ e, km });
    if (!e.novelty) {
      // (supplies: their spacing by the difficulty's supply — more of them on the comfortable one)
      while (km < toKm) {
        const thing = e.litres && 'tool' in e.thing ? { ...e.thing, litres: Math.round((e.litres[0] + (e.litres[1] - e.litres[0]) * r.next()) * 10) / 10 } : e.thing;
        out.push({ entry: e.id, thing, s: km * 1000, themes: e.themes, novelty: false });
        if (!e.everyKm) break;
        km += (e.everyKm[0] + (e.everyKm[1] - e.everyKm[0]) * r.next()) / supply;
      }
    }
  });
  // the novelties' firsts, spaced: one pushed on past the one before it by the gap
  const novel = firsts.filter((f) => f.e.novelty).sort((a, b) => a.km - b.km);
  let last = -Infinity;
  for (const f of novel) {
    if (f.km < last + NOVELTY_GAP_KM) f.km = last + NOVELTY_GAP_KM;
    // (the first three, the ones of the first kilometres, come together: a crowbar and a torch at the first station)
    if (f.e.firstKm[1] <= 3) f.km = Math.min(f.km, f.e.firstKm[1]);
    else last = f.km;
  }
  SCHEDULE.forEach((e, i) => {
    if (!e.novelty) return;
    const f = firsts.find((x) => x.e === e)!;
    const r = new Rng(hash2(seed | 0, 0x5c4ee, i));
    let km = f.km;
    let n = 0;
    while (km < toKm) {
      const w: ScheduledThing[] = [];
      for (const c of e.with ?? []) if (r.next() < c.chance) w.push(c.thing);
      out.push({ entry: e.id, thing: e.thing, s: km * 1000, themes: e.themes, novelty: true, ...(w.length ? { with: w } : {}) });
      // what goes after the first one, within its kilometres
      if (n === 0) for (const a of e.after ?? []) out.push({ entry: `${e.id}+`, thing: a.thing, s: (km + a.km[0] + (a.km[1] - a.km[0]) * r.next()) * 1000, novelty: false });
      n++;
      if (!e.everyKm) break;
      km += e.everyKm[0] + (e.everyKm[1] - e.everyKm[0]) * r.next();
    }
  });
  out.sort((a, b) => a.s - b.s);
  return out;
}

/** a place down the road that may take a planned find: where it is (m), what sort, how many boxes it has to put things in */
export interface PlanPlace {
  s: number;
  kind: SiteKind;
  boxes: number;
  /**
   * no box of its own, but the ground by a wreck (loot.ts planGround): it takes only what wants no sort of place (the
   * petrol) or wants this sort (a verge's tyre kit)
   */
  ground?: boolean;
  /** has it room for this one (absent: for any) — a vehicle to find wants ground of its own size (wrecks.ts VehicleFinds) */
  room?: (f: PlannedFind) => boolean;
}

/** may this place take this find: a box of its own, or the ground by a wreck for what may lie by the road — and room for it */
function fits(f: PlannedFind, p: Pick<PlanPlace, 'kind' | 'boxes' | 'ground' | 'room'>): boolean {
  return (p.boxes > 0 || (!!p.ground && (!f.themes || f.themes.includes(p.kind)))) && (!p.room || p.room(f));
}

/** how far a planned find waits for a place of its own sort before it takes any (m: Nomad Drive's) */
export const THEME_WAIT_M = 600;

/**
 * The plan laid over a world's places as one comes down the road (the game's; placeFinds does the same at once): fed
 * the places in road order, each takes what is due at it — a find waiting up to THEME_WAIT_M for a place of its sorts,
 * then any place with boxes — and says what it holds. The same places give the same answer however they come in.
 */
export class SitePlanner {
  private readonly pending: PlannedFind[] = [];
  private next = 0;
  private readonly at = new Map<string, PlannedFind[]>();
  /** places taken in up to here (m) */
  private to = -Infinity;

  constructor(private readonly finds: readonly PlannedFind[]) {}

  /** how far down the road the places have been taken in (m) */
  get through(): number {
    return this.to;
  }

  /** the places from where the last ended, in road order: what each holds is decided */
  take(places: readonly (PlanPlace & { id: string })[]): void {
    for (const p of places) {
      if (p.s <= this.to) continue;
      this.to = p.s;
      while (this.next < this.finds.length && this.finds[this.next].s <= p.s + 1) this.pending.push(this.finds[this.next++]);
      if (p.boxes <= 0 && !p.ground) continue;
      for (let i = 0; i < this.pending.length; i++) {
        const f = this.pending[i];
        if (!fits(f, p)) continue;
        const sorts = !f.themes || f.themes.includes(p.kind);
        if (!sorts && p.s < f.s + THEME_WAIT_M) continue;
        const list = this.at.get(p.id) ?? [];
        list.push(f);
        this.at.set(p.id, list);
        this.pending.splice(i--, 1);
      }
    }
  }

  /** what of the plan a place holds (taken in already) */
  findsAt(id: string): readonly PlannedFind[] {
    return this.at.get(id) ?? [];
  }
}

/**
 * Where each planned find is found: the first place at or after where it is due that is of its sorts (if one comes
 * within THEME_WAIT_M), else the first place with boxes at all from there on. `places` in road order. Returns, for
 * each place's index, the finds it holds.
 */
export function placeFinds(finds: readonly PlannedFind[], places: readonly PlanPlace[]): Map<number, PlannedFind[]> {
  const out = new Map<number, PlannedFind[]>();
  let from = 0;
  for (const f of finds) {
    while (from < places.length && places[from].s < f.s - 1) from++;
    let at = -1;
    for (let i = from; i < places.length && places[i].s <= f.s + THEME_WAIT_M; i++) {
      if (fits(f, places[i]) && (!f.themes || f.themes.includes(places[i].kind))) {
        at = i;
        break;
      }
    }
    if (at < 0) for (let i = from; i < places.length; i++) if (fits(f, places[i]) && places[i].s >= f.s + (f.themes ? THEME_WAIT_M : 0)) {
      at = i;
      break;
    }
    if (at < 0) continue;
    const list = out.get(at) ?? [];
    list.push(f);
    out.set(at, list);
  }
  return out;
}
