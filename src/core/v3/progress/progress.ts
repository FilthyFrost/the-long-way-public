/**
 * Skills and the compendium (node W3 opens them for foraging; node P1 builds the whole of progression here).
 * A skill is practised by doing: experience adds up, twenty levels, a perk at some of them, no level wall
 * anywhere (a perk makes things better, nothing is locked behind one). The compendium remembers what the
 * player has met and what they know by name.
 *
 * Pure: no three, no DOM, no clock of its own. The game's module owns one Progress, saves it as a slice and
 * says what happened on the event bus.
 */
import type { CompendiumId, SkillId } from '../contracts/base';
import { SKILL_MAX_LEVEL, type CompendiumDomain, type CompendiumEntry, type Knowledge, type LearnedBy, type PerkDef, type ProgressSave, type SkillDef } from './types';

const SKILLS: SkillDef[] = [];
const SKILL_BY_ID = new Map<string, SkillDef>();
const PERK_BY_ID = new Map<string, { skill: string; perk: PerkDef }>();

/** a skill (a system does this once, as its module is loaded); an id taken already, or a perk's, throws */
export function registerSkill(def: SkillDef): void {
  if (SKILL_BY_ID.has(def.id)) throw new Error(`skill ${def.id} is registered already`);
  for (const p of def.perks) {
    if (PERK_BY_ID.has(p.id)) throw new Error(`perk ${p.id} is registered already`);
    if (!Number.isInteger(p.level) || p.level < 2 || p.level > SKILL_MAX_LEVEL) throw new Error(`perk ${p.id}: a level from 2 to ${SKILL_MAX_LEVEL}`);
  }
  SKILLS.push(def);
  SKILL_BY_ID.set(def.id, def);
  for (const p of def.perks) PERK_BY_ID.set(p.id, { skill: def.id, perk: p });
}

export function skills(): readonly SkillDef[] {
  return SKILLS;
}

export function skillDef(id: SkillId): SkillDef {
  const d = SKILL_BY_ID.get(id);
  if (!d) throw new Error(`no skill ${id}`);
  return d;
}

/**
 * The experience a level takes in all, from nothing: level 1 is where everyone starts (0), each level asks a
 * little more than the last, level 20 comes to 6,000 or so. With a common pick worth 1 and a rare one 8, the
 * first perk (level 5) comes within a few stops, the last after a long journey.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = (level > SKILL_MAX_LEVEL ? SKILL_MAX_LEVEL : level) - 1;
  return Math.round(12 * n + 0.82 * n * n * n);
}

/** the level a sum of experience comes to, 1 … SKILL_MAX_LEVEL */
export function levelOf(xp: number): number {
  let l = 1;
  while (l < SKILL_MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

/** how far through its level a sum of experience is, 0 … 1 (1 at the last level) */
export function levelShare(xp: number): number {
  const l = levelOf(xp);
  if (l >= SKILL_MAX_LEVEL) return 1;
  const a = xpForLevel(l);
  return (xp - a) / (xpForLevel(l + 1) - a);
}

function key(domain: CompendiumDomain, id: CompendiumId): string {
  return `${domain}/${id}`;
}

export class Progress {
  private readonly xps = new Map<string, number>();
  private readonly entries = new Map<string, CompendiumEntry>();

  // ---------------------------------------------------------------- skills

  xp(skill: SkillId): number {
    return this.xps.get(skill) ?? 0;
  }

  level(skill: SkillId): number {
    return levelOf(this.xp(skill));
  }

  /** practise a skill: returns how many levels that gained (0 nearly always) */
  addXp(skill: SkillId, n: number): number {
    if (!(n > 0)) return 0;
    const before = this.level(skill);
    this.xps.set(skill, this.xp(skill) + n);
    return this.level(skill) - before;
  }

  /** has the player the perk? (its skill has reached its level) */
  hasPerk(perk: string): boolean {
    const p = PERK_BY_ID.get(perk);
    return !!p && this.level(p.skill) >= p.perk.level;
  }

  /** the perks a level of a skill grants (for the line said when it is reached) */
  perksAt(skill: SkillId, level: number): readonly PerkDef[] {
    return SKILL_BY_ID.get(skill)?.perks.filter((p) => p.level === level) ?? [];
  }

  // ---------------------------------------------------------------- the compendium

  /** what the player knows of a thing: 0 never met, 1 met, 2 known by name */
  knowledge(domain: CompendiumDomain, id: CompendiumId): Knowledge {
    return this.entries.get(key(domain, id))?.state ?? 0;
  }

  entry(domain: CompendiumDomain, id: CompendiumId): CompendiumEntry | null {
    return this.entries.get(key(domain, id)) ?? null;
  }

  private open(domain: CompendiumDomain, id: CompendiumId, day: number): CompendiumEntry {
    const k = key(domain, id);
    let e = this.entries.get(k);
    if (!e) {
      e = { domain, id, state: 1, count: 0, firstDay: day };
      this.entries.set(k, e);
    }
    return e;
  }

  /** the player met a thing (picked it, saw it): `n` more of it counted. True the first time ever. */
  meet(domain: CompendiumDomain, id: CompendiumId, day: number, n = 1): boolean {
    const first = !this.entries.has(key(domain, id));
    this.open(domain, id, day).count += n;
    return first;
  }

  /** the player knows a thing by name from now on. True when that is news. */
  learn(domain: CompendiumDomain, id: CompendiumId, by: LearnedBy, day: number): boolean {
    const e = this.open(domain, id, day);
    if (e.state === 2) return false;
    e.state = 2;
    e.by = by;
    return true;
  }

  /** how many things of a domain are met, and how many known */
  tally(domain: CompendiumDomain): { met: number; known: number } {
    let met = 0;
    let known = 0;
    for (const e of this.entries.values()) {
      if (e.domain !== domain) continue;
      met++;
      if (e.state === 2) known++;
    }
    return { met, known };
  }

  // ---------------------------------------------------------------- the save

  /** what the save keeps; undefined when there is nothing to keep */
  snapshot(): ProgressSave | undefined {
    if (this.xps.size === 0 && this.entries.size === 0) return undefined;
    const xp: Record<string, number> = {};
    for (const k of [...this.xps.keys()].sort()) xp[k] = this.xps.get(k)!;
    const entries = [...this.entries.values()]
      .sort((a, b) => (key(a.domain, a.id) < key(b.domain, b.id) ? -1 : 1))
      .map((e) => ({ d: e.domain, id: e.id, s: e.state, n: e.count, ...(e.firstDay !== undefined ? { day: e.firstDay } : {}), ...(e.by ? { by: e.by } : {}) }));
    return { xp, entries };
  }

  /** take a save back: what is not sound in it is passed over, never thrown on */
  restore(s: ProgressSave | null | undefined): void {
    this.clear();
    if (!s || typeof s !== 'object') return;
    if (s.xp && typeof s.xp === 'object') for (const k of Object.keys(s.xp)) if (typeof s.xp[k] === 'number' && s.xp[k] > 0 && Number.isFinite(s.xp[k])) this.xps.set(k, s.xp[k]);
    if (Array.isArray(s.entries)) {
      for (const e of s.entries) {
        if (!e || typeof e.d !== 'string' || typeof e.id !== 'string') continue;
        const state: Knowledge = e.s === 2 ? 2 : 1;
        this.entries.set(key(e.d, e.id), { domain: e.d, id: e.id, state, count: typeof e.n === 'number' && e.n > 0 ? Math.floor(e.n) : 0, ...(typeof e.day === 'number' ? { firstDay: e.day } : {}), ...(e.by ? { by: e.by } : {}) });
      }
    }
  }

  clear(): void {
    this.xps.clear();
    this.entries.clear();
  }
}
