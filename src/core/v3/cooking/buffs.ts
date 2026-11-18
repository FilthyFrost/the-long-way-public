/**
 * Timed buffs (node C1, docs/V3/nodes/C1-cooking.md): what a good meal leaves behind for a while. A buff is
 * a name, a time left and a strength; what it does is read by whoever it concerns (the body's rules for
 * hunger, thirst, warmth and wind; foraging for the glint; later fishing and hunting for the steady hand and
 * the quiet step). One table for the whole game, so that any system can grant a buff or ask for one.
 *
 * The rule of the table: a meal's buff takes one of two meal places and a drink's the one drink place; a
 * third meal pushes out the meal buff with the least time left. The same buff again does not stack: it takes
 * the longer of the two times and the stronger of the two strengths.
 *
 * Pure: no three, no DOM, no clock of its own (the game steps it with the frame's seconds).
 */
import type { Text } from '../contracts/base';
import type { BuffId } from './types';

/** where a buff sits: one of two meal places, the one drink place, or beside them (granted by something that is neither) */
export type BuffSlot = 'meal' | 'drink' | 'other';

export interface BuffDef {
  readonly id: BuffId;
  readonly name: Text;
  /** what it does, in a line for its card */
  readonly blurb: Text;
}

/** the ten buffs of cooking, and what each is worth at strength 1 (the numbers its readers use) */
export const BUFFS: Readonly<Record<BuffId, BuffDef>> = {
  warm: { id: 'warm', name: { zh: '暖身', en: 'Warm' }, blurb: { zh: '身子暖，冷得慢。', en: 'Warm inside: the cold bites slower.' } },
  cool: { id: 'cool', name: { zh: '清凉', en: 'Cool' }, blurb: { zh: '不怕晒，热得慢。', en: 'Cool-headed: the heat builds slower.' } },
  vigor: { id: 'vigor', name: { zh: '有劲', en: 'Vigour' }, blurb: { zh: '体力回得快。', en: 'Stamina comes back faster.' } },
  hearty: { id: 'hearty', name: { zh: '耐饿', en: 'Well fed' }, blurb: { zh: '饿得慢。', en: 'Hunger comes slower.' } },
  hydrated: { id: 'hydrated', name: { zh: '解渴', en: 'Quenched' }, blurb: { zh: '渴得慢。', en: 'Thirst comes slower.' } },
  sturdy: { id: 'sturdy', name: { zh: '负重', en: 'Sturdy' }, blurb: { zh: '搬重东西走得快。', en: 'Heavy things carry easier.' } },
  keen: { id: 'keen', name: { zh: '眼尖', en: 'Keen eyes' }, blurb: { zh: '更远就看得见能采的东西。', en: 'Things to pick show from further off.' } },
  steady: { id: 'steady', name: { zh: '手稳', en: 'Steady hands' }, blurb: { zh: '瞄得稳，起竿的时机更宽。', en: 'A steadier aim and a longer moment to strike.' } },
  quiet: { id: 'quiet', name: { zh: '脚步轻', en: 'Light step' }, blurb: { zh: '走路的动静小。', en: 'Footsteps carry less far.' } },
  lucky: { id: 'lucky', name: { zh: '好运', en: 'Lucky' }, blurb: { zh: '多得一份的机会大一点。', en: 'A better chance of a little extra.' } },
};

/** what each buff is worth at strength 1: its readers multiply or add these */
export const BUFF_WORTH = {
  /** hunger and thirst come this much slower (a factor on the drain) */
  hearty: 0.75,
  hydrated: 0.75,
  /** stamina comes back this much faster */
  vigor: 1.3,
  /** the comfort of the air moves by this many degrees: warm makes cold air feel milder, cool hot air */
  warm: 6,
  cool: 6,
  /** a load slows the walker this much less (a factor on the slowing) */
  sturdy: 0.6,
  /** the forager's glint shows this many metres further */
  keen: 8,
  /** aim sways by this factor; the moment to strike a fish is this many seconds longer */
  steadySway: 0.7,
  steadyStrike: 0.15,
  /** footsteps are heard over this share of the distance */
  quiet: 0.6,
  /** the chance of a double pick or find rises by this much */
  lucky: 0.1,
} as const;

/** how many meal buffs and drink buffs there may be at once */
export const MEAL_PLACES = 2;
export const DRINK_PLACES = 1;

interface Active {
  id: BuffId;
  left: number;
  strength: number;
  slot: BuffSlot;
}

/** what the save keeps */
export type BuffsSave = { id: BuffId; left: number; k: number; slot: BuffSlot }[];

export class Buffs {
  private readonly list: Active[] = [];

  /**
   * Grant a buff for `seconds` (a dish's buffS) in a slot. Returns the buff this one pushed out (null: none).
   * The same buff again takes the longer time and the greater strength and pushes nothing out.
   */
  add(id: BuffId, seconds: number, slot: BuffSlot, strength = 1): BuffId | null {
    if (!(seconds > 0) || !BUFFS[id]) return null;
    for (const a of this.list) {
      if (a.id !== id) continue;
      if (seconds > a.left) a.left = seconds;
      if (strength > a.strength) a.strength = strength;
      return null;
    }
    let out: BuffId | null = null;
    const places = slot === 'meal' ? MEAL_PLACES : slot === 'drink' ? DRINK_PLACES : Infinity;
    let same = 0;
    let oldest = -1;
    for (let i = 0; i < this.list.length; i++) {
      if (this.list[i].slot !== slot) continue;
      same++;
      if (oldest < 0 || this.list[i].left < this.list[oldest].left) oldest = i;
    }
    if (same >= places && oldest >= 0) {
      out = this.list[oldest].id;
      this.list.splice(oldest, 1);
    }
    this.list.push({ id, left: seconds, strength, slot });
    return out;
  }

  /** let dt seconds pass; returns how many buffs ran out in it (allocates nothing while none does) */
  step(dt: number): number {
    if (!(dt > 0)) return 0;
    let ended = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.left -= dt;
      if (a.left <= 0) {
        this.list.splice(i, 1);
        ended++;
      }
    }
    return ended;
  }

  /** the strength of a buff now (0: not active) */
  strength(id: BuffId): number {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i].strength;
    return 0;
  }

  /** seconds a buff has left (0: not active) */
  left(id: BuffId): number {
    for (let i = 0; i < this.list.length; i++) if (this.list[i].id === id) return this.list[i].left;
    return 0;
  }

  /** how many are active */
  get count(): number {
    return this.list.length;
  }

  /** the i-th active buff's id (for the HUD, in the order granted) */
  at(i: number): BuffId {
    return this.list[i].id;
  }

  clear(): void {
    this.list.length = 0;
  }

  snapshot(): BuffsSave | undefined {
    return this.list.length ? this.list.map((a) => ({ id: a.id, left: Math.round(a.left * 10) / 10, k: a.strength, slot: a.slot })) : undefined;
  }

  /** take a save back; what is not sound in it is passed over */
  restore(s: BuffsSave | null | undefined): void {
    this.list.length = 0;
    if (!Array.isArray(s)) return;
    for (const a of s) {
      if (!a || !BUFFS[a.id] || !(a.left > 0) || !Number.isFinite(a.left)) continue;
      const slot: BuffSlot = a.slot === 'meal' || a.slot === 'drink' ? a.slot : 'other';
      this.list.push({ id: a.id, left: a.left, strength: a.k > 0 && Number.isFinite(a.k) ? a.k : 1, slot });
    }
  }
}
