/**
 * What other modules call of the progress module (node W3 opens it for foraging; node P1 builds the whole of
 * progression on it): the game's one Progress — the skills' experience and the compendium, whose rules are
 * src/core/v3/progress/progress.ts — and the helpers through which it is changed.
 *
 * Read the Progress freely (`progress.level('forage')`, `progress.hasPerk('forage_glow')`,
 * `progress.knowledge('forage', id)`). CHANGE it through the helpers here and not by its own methods: a helper
 * says what happened on the event bus (skill:xp, skill:level, compendium:met, compendium:learned), counts the
 * change (progressRev: whoever keeps something worked out from the Progress asks whether the number has moved
 * and works it out again), and puts what the player should hear of into one short line.
 *
 * Lines. Everything the progress of the player is said with goes through `announce`: one line at a time in the
 * game's toast, a line that comes while another of these is still up waiting its turn (the toast itself is
 * last-writer-wins), and none said while one drives: lines wait until the vehicle is down to a walk. A system
 * that wants its own words for what happened (foraging says "+3 野莓" for a pick, and folds "the first one
 * ever" into that line) asks the helper to be `quiet` and announces its own.
 *
 * A system brings: its skill, registered with the core as its module is loaded (registerSkill); and, when it
 * keeps things in the compendium, its domain (registerDomain here), so that the lines and the developer's tab
 * can name a thing of it and list them all.
 *
 * This file imports in plain Node and touches nothing of the page.
 */
import { levelOf, Progress, skillDef, xpForLevel } from '../../../../core/v3/progress/progress';
import { SKILL_MAX_LEVEL, type LearnedBy, type ProgressSave } from '../../../../core/v3/progress/types';
import type { Text } from '../../../../core/modcar/types';
import type { GameContext } from '../../kernel/context';

declare module '../../../../core/kernel/events' {
  interface GameEvents {
    /** a skill was practised: `gained` more experience, `xp` in all now, at `level` */
    'skill:xp': { readonly skill: string; readonly gained: number; readonly xp: number; readonly level: number };
    /** a skill reached a level (one event however many levels were gained at once: `from` is where it stood) */
    'skill:level': { readonly skill: string; readonly level: number; readonly from: number };
    /** a thing of the compendium was met for the first time ever */
    'compendium:met': { readonly domain: string; readonly id: string };
    /** a thing of the compendium is known by name from now on */
    'compendium:learned': { readonly domain: string; readonly id: string; readonly by: LearnedBy };
  }
}

/** the game's one Progress */
export const progress = new Progress();

// ------------------------------------------------------------------ the count of changes

let rev = 0;

/**
 * Goes up whenever what the player knows or can do may have changed: a level gained, a thing met or learnt,
 * the save read back, a new game, the developer's hand. A veil, a card or a list worked out from the Progress
 * keeps the number it was worked out at.
 */
export function progressRev(): number {
  return rev;
}

/** the Progress was changed past the helpers (the module's own slice and developer's tab): counted */
export function progressChanged(): void {
  rev++;
}

// ------------------------------------------------------------------ the domains of the compendium

/** a field of the compendium, as the system that fills it describes it */
export interface CompendiumDomainDef {
  readonly id: string;
  readonly name: Text;
  /** every thing of it (for the developer's tab: learn all, forget all; and for how many there are) */
  ids(): readonly string[];
  /** what a thing of it is called NOW: its name, or what it goes by while the player does not know it */
  nameOf(id: string): Text;
}

const DOMAINS: CompendiumDomainDef[] = [];

/** a system's field of the compendium (once, as its module is loaded); an id taken already throws */
export function registerDomain(def: CompendiumDomainDef): void {
  if (DOMAINS.some((d) => d.id === def.id)) throw new Error(`compendium domain ${def.id} is registered already`);
  DOMAINS.push(def);
}

export function domains(): readonly CompendiumDomainDef[] {
  return DOMAINS;
}

function domainOf(id: string): CompendiumDomainDef | undefined {
  for (let i = 0; i < DOMAINS.length; i++) if (DOMAINS[i].id === id) return DOMAINS[i];
  return undefined;
}

// ------------------------------------------------------------------ lines

/** a vehicle no faster than this is at a walk (km/h): foraging looks about, lines are said */
export const WALK_KMH = 8;

/** on foot, or in a seat at no more than a walk */
export function atWalkingPace(ctx: GameContext): boolean {
  const v = ctx.seated;
  return !v || v.sim.kmh <= WALK_KMH;
}

/** the most lines that wait their turn: past this the oldest is let go (never a wall of them) */
const LINES_MOST = 5;
/** a breath between two lines (s) */
const LINE_GAP = 0.25;

const waiting: { text: string; seconds: number }[] = [];
/** how long the line last said by `announce` is still up (game seconds) */
let showing = 0;
/** the progress system is running and brings the waiting lines out (while it is not, every line is said at once) */
let stepped = false;

function lang(ctx: GameContext): 'zh' | 'en' {
  return ctx.ui.lang === 'en' ? 'en' : 'zh';
}

/**
 * One short line for the player, in the game's toast. Said at once when none of these is up and one is not
 * driving; otherwise in its turn (the progress system brings the lines out, in lateUpdate).
 */
export function announce(ctx: GameContext, text: string, seconds = 2): void {
  if (!stepped || (showing <= 0 && waiting.length === 0 && atWalkingPace(ctx))) {
    ctx.ui.say(text, seconds);
    showing = seconds + LINE_GAP;
    return;
  }
  if (waiting.length >= LINES_MOST) waiting.shift();
  waiting.push({ text, seconds });
}

/** the progress system's part of a frame: the line that is up runs down, the next one waiting is said */
export function stepLines(dt: number, ctx: GameContext): void {
  if (showing > 0) showing -= dt;
  if (showing > 0 || waiting.length === 0 || !atWalkingPace(ctx)) return;
  const next = waiting.shift()!;
  ctx.ui.say(next.text, next.seconds);
  showing = next.seconds + LINE_GAP;
}

/** no line up, none waiting (a game begins); `live`: the progress system is there to bring waiting lines out */
export function clearLines(live: boolean): void {
  while (waiting.length > 0) waiting.pop();
  showing = 0;
  stepped = live;
}

/** how many lines wait their turn (for the tests and the developer's tab) */
export function linesWaiting(): number {
  return waiting.length;
}

// ------------------------------------------------------------------ the helpers that change the Progress

/** how a helper should behave beyond the change itself */
export interface Quiet {
  /** say no line: the caller words what happened itself */
  readonly quiet?: boolean;
}

/**
 * Practise a skill: `n` more experience. Says skill:xp, and when a level was gained skill:level and a line
 * (with the perk's name when the level grants one). Returns how many levels that gained (0 nearly always).
 */
export function gainXp(ctx: GameContext, skill: string, n: number, o: Quiet = {}): number {
  if (!(n > 0)) return 0;
  const from = progress.level(skill);
  const gained = progress.addXp(skill, n);
  const level = from + gained;
  if (ctx.events.has('skill:xp')) ctx.events.emit('skill:xp', { skill, gained: n, xp: progress.xp(skill), level });
  if (gained > 0) {
    rev++;
    // (the line first: what the level's listeners have to say of it comes after it)
    if (!o.quiet) announce(ctx, levelLine(skill, from, level, lang(ctx)), 2.6);
    ctx.events.emit('skill:level', { skill, level, from });
  }
  return gained;
}

/** the line for a level reached: the skill, the level, and the perks the levels gained grant */
export function levelLine(skill: string, from: number, level: number, l: 'zh' | 'en'): string {
  const def = skillDef(skill);
  const perks: string[] = [];
  for (let k = from + 1; k <= level; k++) for (const p of progress.perksAt(skill, k)) perks.push(p.name[l]);
  if (l === 'en') return `${def.name.en} level ${level}${perks.length ? ` · new: ${perks.join(', ')}` : ''}`;
  return `${def.name.zh}升到 ${level} 级${perks.length ? ` · 学会了「${perks.join('」「')}」` : ''}`;
}

/**
 * The player met a thing (picked it, caught it, saw it): `n` more of it counted. The first time any is counted
 * it says compendium:met and a line. True that first time.
 */
export function meet(ctx: GameContext, domain: string, id: string, n = 1, o: Quiet = {}): boolean {
  // (the first time is the first one counted: a thing learnt from a page before it was ever found has an entry
  // already, with none counted, and is still to be met)
  const before = progress.entry(domain, id);
  const first = !before || before.count === 0;
  progress.meet(domain, id, ctx.clock.day, n);
  if (!first) return false;
  rev++;
  ctx.events.emit('compendium:met', { domain, id });
  if (!o.quiet) {
    const name = domainOf(domain)?.nameOf(id);
    if (name) announce(ctx, lang(ctx) === 'en' ? `First find: ${name.en}` : `第一次见到：${name.zh}`, 2);
  }
  return true;
}

/**
 * The player knows a thing by name from now on. When that is news it says compendium:learned and a line.
 * True when it is news.
 */
export function learn(ctx: GameContext, domain: string, id: string, by: LearnedBy, o: Quiet = {}): boolean {
  if (!progress.learn(domain, id, by, ctx.clock.day)) return false;
  rev++;
  ctx.events.emit('compendium:learned', { domain, id, by });
  if (!o.quiet) {
    const name = domainOf(domain)?.nameOf(id);
    if (name) announce(ctx, lang(ctx) === 'en' ? `Identified: ${name.en}` : `认出来了：${name.zh}`, 2);
  }
  return true;
}

/**
 * Several things learnt at once (a page of the compendium read, a level that teaches a rarity): each that is
 * news says compendium:learned, and no line is said: the caller has one for the lot. Returns how many were news.
 */
export function learnMany(ctx: GameContext, domain: string, ids: readonly string[], by: LearnedBy): number {
  let news = 0;
  for (const id of ids) if (learn(ctx, domain, id, by, QUIET)) news++;
  return news;
}

const QUIET: Quiet = { quiet: true };

// ------------------------------------------------------------------ the developer's hand, and the save

/** a skill put at a level (1 … 20): its experience is what that level takes; counted, said as skill:level */
export function setSkillLevel(ctx: GameContext, skill: string, level: number): number {
  const to = Math.max(1, Math.min(SKILL_MAX_LEVEL, Math.round(level)));
  const from = progress.level(skill);
  const s: ProgressSave = progress.snapshot() ?? { xp: {}, entries: [] };
  if (to <= 1) delete s.xp[skill];
  else s.xp[skill] = xpForLevel(to);
  progress.restore(s);
  rev++;
  if (to !== from) ctx.events.emit('skill:level', { skill, level: to, from });
  return to;
}

/** everything of a domain forgotten, as if never met; returns how many entries went */
export function forgetDomain(domain: string): number {
  const s = progress.snapshot();
  if (!s) return 0;
  const keep = s.entries.filter((e) => e.d !== domain);
  const gone = s.entries.length - keep.length;
  progress.restore({ xp: s.xp, entries: keep });
  rev++;
  return gone;
}

/** the level a sum of experience comes to (the core's, for whoever shows a bar) */
export { levelOf };
