/**
 * The world clock of the V3 kernel (docs/V3/nodes/N0-foundation.md): the time of the journey that is saved and
 * never runs backwards. Everything that waits for a later hour or day (regrowth, freshness, an animal's day)
 * counts in it; the game's own `time` starts from nothing on every load and is no use for that.
 *
 * `worldSeconds` is game time since the journey began, 86,400 to a game day. The clock keeps no pace of its
 * own: once a frame it reads the hour of the day the environment shows (`sync`), and moves forward by as
 * much as the hour hand moved forward. So it runs exactly as the hour does — slowly through dawn and dusk,
 * quickly at night, not at all while the developer's panel holds time still — and when the hour is set by hand
 * to an earlier one, that is the hour hand going on round to it: the next day.
 *
 * `day` counts midnights passed since the calendar day the journey began on (day 0); `hour` is the hour of the
 * day, 0 ≤ hour < 24. Each sync says how many whole hours and midnights it crossed, for the game to announce.
 *
 * Pure: no three, no DOM.
 */

export const DAY_SECONDS = 86_400;

/**
 * An hour hand that comes back by less than this (hours) has not been set back: it quivered (rounding, as when
 * the developer's panel holds time still by taking every frame's seconds off again). The clock holds its hour.
 */
const HOLD = 1e-6;

/** the clock as the save holds it */
export interface ClockSave {
  /** midnights passed since the calendar day the journey began on */
  day: number;
  /** the hour of the day, 0 ≤ hour < 24 */
  hour: number;
  /** the hour of the day the journey began at */
  start: number;
}

/** the world's time as a system reads it */
export interface WorldTime {
  /** game time since the journey began (s), 86,400 to a game day; saved; never runs backwards */
  readonly worldSeconds: number;
  /** midnights passed since the calendar day the journey began on (a whole number from 0) */
  readonly day: number;
  /** the hour of the day, 0 ≤ hour < 24 */
  readonly hour: number;
}

/** whatever shows the hour of the day (the environment's sky does) */
export interface HourHand {
  readonly hour: number;
}

/** an hour of the day from any number of hours */
function wrap(hour: number): number {
  const h = hour % 24;
  return h < 0 ? h + 24 : h;
}

export class WorldClock implements WorldTime {
  // (plain fields, not getters: a system reads them every frame, and reading a field never allocates)
  worldSeconds = 0;
  day = 0;
  hour = 0;
  /** the hour of the day the journey began at */
  startHour = 0;
  /** whole hours and midnights the last sync crossed (0 when it crossed none) */
  hoursCrossed = 0;
  daysCrossed = 0;

  /** a journey begins at this hour of the day: day 0, no time passed yet */
  begin(hour: number): void {
    const h = Number.isFinite(hour) ? wrap(hour) : 0;
    this.day = 0;
    this.hour = h;
    this.startHour = h;
    this.worldSeconds = 0;
    this.hoursCrossed = 0;
    this.daysCrossed = 0;
  }

  /**
   * The hour of the day is now what `from` shows (the environment's sky). The clock moves forward to it — by
   * the way round the dial, so an hour earlier than the clock's is that hour the next day — and says whether
   * it moved. One call can see less than a day go by.
   *
   * (It is handed the thing that shows the hour, not the hour: a fraction passed from one function to another
   * may be put on the heap on the way, and this is called every frame.)
   */
  sync(from: HourHand): boolean {
    this.hoursCrossed = 0;
    this.daysCrossed = 0;
    // (Comparisons and arithmetic only, no call to another function with the hour for its argument or its
    // result — not even to wrap() below: a fraction that goes into or comes out of a call the engine has not
    // folded in is put on the heap, and one such call on a branch never taken was measured to cost an
    // allocation on every call of this function.)
    let to = from.hour;
    if (!(to >= 0 && to < 24)) {
      // (not a number, or without end: no hour at all)
      if (!(to - to === 0)) return false;
      to %= 24;
      if (to < 0) to += 24;
    }
    const was = this.hour;
    let forward = to - was;
    if (forward < 0) forward += 24;
    // (no move, or a quiver backwards — across midnight too: held)
    if (forward === 0 || forward > 24 - HOLD) return false;
    // (the whole hours: both hours are 0 or more, so cutting the fraction off rounds down)
    let crossed = (to | 0) - (was | 0);
    if (to < was) {
      this.day++;
      this.daysCrossed = 1;
      crossed += 24;
    }
    this.hour = to;
    this.hoursCrossed = crossed;
    this.worldSeconds = (this.day * 24 + to - this.startHour) * 3600;
    return true;
  }

  snapshot(): ClockSave {
    return { day: this.day, hour: this.hour, start: this.startHour };
  }

  /** take a saved clock back; false (and nothing changed) when it is not one */
  restore(saved: unknown): boolean {
    const s = saved as ClockSave | null | undefined;
    if (typeof s !== 'object' || s === null) return false;
    const hourOk = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x < 24;
    if (!Number.isInteger(s.day) || s.day < 0 || !hourOk(s.hour) || !hourOk(s.start)) return false;
    // (a journey cannot have got to an hour before the one it began at on its first day)
    if (s.day === 0 && s.hour < s.start) return false;
    this.day = s.day;
    this.hour = s.hour;
    this.startHour = s.start;
    this.worldSeconds = (s.day * 24 + s.hour - s.start) * 3600;
    this.hoursCrossed = 0;
    this.daysCrossed = 0;
    return true;
  }
}

declare module './events' {
  interface GameEvents {
    /** midnight passed on the world's clock: `day` has begun (`crossed` midnights at once: always 1 today) */
    'clock:day': { readonly day: number; readonly crossed: number };
    /**
     * The world's clock passed a whole hour: `hour` (0…23) of `day` has begun. Setting the hour by hand passes
     * several at once: one event, `crossed` saying how many.
     */
    'clock:hour': { readonly day: number; readonly hour: number; readonly crossed: number };
  }
}
