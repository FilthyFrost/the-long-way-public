/**
 * What the angler has caught (docs/V3/plan/fishing.md): the fishing module's own part of the save, in place of the
 * first build's angler (progress.ts: its wallet, shop, licences and orders are gone with the panels, and its levels and
 * experience too: fishing has none, the user's word of 2026-11-24). The compendium is the game's own (its progress
 * module); what is kept here is what only fishing reads:
 *
 *   kinds   by fish: how many, the biggest, the medals and the colours seen
 *   ponds   by water: the day its stock is of, the fish taken out of it that day, the fish added since the morning
 *   streak  perfect strikes in a row; pity: catches since the last one with a colour (at 40 the next has one)
 *   clues   the lords whose habits a drift bottle told; told: the tips said once
 *   lastBait  the bait last fished with: what a bare rod takes up first as it is cast, when one carries it
 *
 * And the two things a catch is worked out from: the rig a rod in the hands makes (its bait, no charms, no tackle
 * box), and what a catch comes to (its colour, its medal, whether it is the first or a record).
 * Pure: nothing here touches the page.
 */
import { FISH, FISH_INDEX } from './fish';
import { BAITS, baitIndexOf, RODS, STAR_TIER } from './gear';
import type { FishItemState } from './items';
import { medalOf, PITY_AT, rollVariant, Stream, type Rig } from './rules';
import type { Landed } from './session';
import { SPOTS } from './spots';
import type { BaitKind, Medal, Variant } from './types';

export interface LogEntry {
  /** how many landed, the longest (cm) and the heaviest (kg), the best medal, the colours seen (a bit each) */
  n: number;
  cm: number;
  kg: number;
  medal: Medal;
  vars: number;
}

export interface PondDay {
  day: number;
  taken: number[];
  refills: number;
}

export interface FishLog {
  v: 1;
  kinds: Record<string, LogEntry>;
  ponds: Record<string, PondDay>;
  streak: number;
  pity: number;
  clues: string[];
  told: string[];
  stats: { casts: number; catches: number; released: number; perfect: number; lost: number; junk: number };
  /** the bait last fished with (its id in gear.ts BAITS) */
  lastBait?: string;
}

export function newLog(): FishLog {
  return { v: 1, kinds: {}, ponds: {}, streak: 0, pity: 0, clues: [], told: [], stats: { casts: 0, catches: 0, released: 0, perfect: 0, lost: 0, junk: 0 } };
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** a log from whatever the save held: what is not right is left out */
export function cleanLog(raw: unknown): FishLog {
  const out = newLog();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<FishLog>;
  for (const [id, e] of Object.entries(r.kinds ?? {})) {
    if (!FISH_INDEX.has(id) || !e || typeof e !== 'object') continue;
    out.kinds[id] = { n: Math.max(0, Math.floor(num(e.n))), cm: num(e.cm), kg: num(e.kg), medal: Math.max(0, Math.min(4, Math.floor(num(e.medal)))) as Medal, vars: Math.floor(num(e.vars)) & 63 };
  }
  for (const [id, p] of Object.entries(r.ponds ?? {})) {
    if (!SPOTS.some((s) => s.id === id) || !p || typeof p !== 'object') continue;
    out.ponds[id] = { day: Math.floor(num(p.day, -1)), taken: Array.isArray(p.taken) ? p.taken.filter((u) => Number.isInteger(u)).slice(0, 200) : [], refills: Math.max(0, Math.floor(num(p.refills))) };
  }
  out.streak = Math.max(0, Math.floor(num(r.streak)));
  out.pity = Math.max(0, Math.floor(num(r.pity)));
  out.clues = Array.isArray(r.clues) ? r.clues.filter((c) => typeof c === 'string' && FISH_INDEX.has(c)) : [];
  out.told = Array.isArray(r.told) ? r.told.filter((c) => typeof c === 'string').slice(0, 100) : [];
  const s = r.stats;
  if (s && typeof s === 'object') for (const k of Object.keys(out.stats) as (keyof FishLog['stats'])[]) out.stats[k] = Math.max(0, Math.floor(num(s[k])));
  // (a bait retired since, or of no kind there is: the one it is now)
  if (typeof r.lastBait === 'string') out.lastBait = BAITS[baitIndexOf(r.lastBait)].id;
  return out;
}

/** has this kind ever been landed */
export function found(log: FishLog, id: string): boolean {
  return (log.kinds[id]?.n ?? 0) > 0;
}

// ------------------------------------------------------------------ the rig of a rod in the hands

/** what is on a rod's hook: a bait of the table (its index), the star bait, a fish alive (index into FISH), or nothing */
export type Hook = { kind: 'bait'; bait: number } | { kind: 'live'; fish: number } | null;

/**
 * The rig the rules read: the rod and what is on its hook; no charms, no tackle box (left out with the shop). A bait
 * draws its own tier's fish; a fish alive, the lords' bait, has no tier; nothing on the hook draws nothing.
 */
export function rigOf(rod: number, hook: Hook, log: FishLog): Rig {
  const r = RODS[Math.max(0, Math.min(RODS.length - 1, rod))];
  let bait: Rig['bait'];
  if (hook?.kind === 'live') bait = { kind: 'lure' as BaitKind, tier: -1, live: hook.fish };
  else if (hook?.kind === 'bait') {
    const b = BAITS[hook.bait];
    bait = b.tier === STAR_TIER ? { kind: 'lure', tier: STAR_TIER, star: true } : { kind: b.kind, tier: b.tier };
  } else bait = { kind: 'meat', tier: -1 };
  return { rod: r, bait, charms: [], tackle: { line: 0, reel: 0, hook: 0, net: 0, box: 0 }, streak: log.streak, pity: log.pity };
}

// ------------------------------------------------------------------ a catch

/** what a fish landed comes to: the thing's state, and what is new about it */
export interface Settled {
  state: FishItemState;
  first: boolean;
  record: boolean;
  newVariant: boolean;
}

/** a fish landed (session.ts Landed, not junk) worked out and written into the log; u: a die for its colour */
export function settle(log: FishLog, l: Landed, rig: Rig, u: number): Settled {
  const def = FISH[l.fish];
  const variant = rollVariant(def, rig, u) as Variant;
  const je = log.kinds[def.id];
  const first = !je || je.n === 0;
  const record = !first && l.cm > je.cm;
  const newVariant = variant > 0 && !(je && je.vars & (1 << variant));
  const medal = medalOf(l.q);
  const e = je ?? { n: 0, cm: 0, kg: 0, medal: 0 as Medal, vars: 0 };
  e.n++;
  e.cm = Math.max(e.cm, l.cm);
  e.kg = Math.max(e.kg, l.kg);
  e.medal = Math.max(e.medal, medal) as Medal;
  e.vars |= 1 << variant;
  log.kinds[def.id] = e;
  log.stats.catches++;
  if (l.perfect) log.stats.perfect++;
  log.streak = l.perfect ? log.streak + 1 : 0;
  log.pity = variant > 0 || def.tier >= 4 ? 0 : log.pity + 1;
  if (log.pity >= PITY_AT) log.pity = 0;
  const state: FishItemState = { cm: l.cm, kg: Math.round(l.kg * 1000) / 1000, q: Math.round(l.q * 1000) / 1000, v: variant, m: medal };
  if (l.perfect) state.p = 1;
  if (first) state.first = 1;
  if (record) state.rec = 1;
  return { state, first, record, newVariant };
}

// ------------------------------------------------------------------ what comes up instead of a fish

/** a drift bottle's note: the habits of the lord of the water it came out of, and now and then a pinch of star bait */
export function bottleNote(spot: number, u: number): { lord: string; text: string; star: boolean } {
  const lords = FISH.filter((f) => f.tier === 4);
  const lord = lords.find((f) => f.spot === spot) ?? lords[0];
  const live = lord.live ? FISH[FISH_INDEX.get(lord.live) ?? 0].zh : '';
  const h = (x: number): string => `${Math.floor(x)}:${String(Math.round((x % 1) * 60)).padStart(2, '0')}`;
  const span = lord.span ? `${h(lord.span[0])}–${h(lord.span[1])}` : '';
  const r = new Stream(Math.floor(u * 1e9));
  return { lord: lord.id, text: `「${lord.zh}只吃活的${live}，${span}出没。」`, star: r.next() < 0.25 };
}

/** what a crate off a wreck holds: star bait now and then, a lure, a pack of bait, a pearl seldom (item ids and counts) */
export function crateContents(spot: number, u: number): [string, number][] {
  const r = new Stream(Math.floor(u * 1e9) + spot * 131);
  const out: [string, number][] = [];
  if (r.next() < 0.4) out.push(['bait_stardust', 1]);
  const lures = BAITS.filter((b) => b.lure);
  const lure = lures[Math.min(lures.length - 1, Math.floor(r.next() * Math.min(lures.length, 1 + spot / 2.5)))];
  if (r.next() < 0.6) out.push([`bait_${lure.id}`, 1]);
  // (common baits out of the first waters, up to epic ones out of the far ones)
  const plain = BAITS.filter((b) => !b.lure && b.tier >= 0 && b.tier <= Math.min(3, Math.floor(spot / 2)));
  const b = plain[Math.floor(r.next() * plain.length)];
  out.push([`bait_${b.id}`, b.pack]);
  if (r.next() < 0.12) out.push(['fishing_pearl', 1]);
  return out;
}
