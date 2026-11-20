/**
 * The journey (docs/V3/research/scenic-50.md §5): the fifty scenic roads shuffled anew for every journey, none twice
 * before all have come, then shuffled again; and between any two of them a join — a gradual change between near
 * neighbours, a quiet stretch of the old country between ones further apart, a threshold that hides the change
 * between worlds apart (a tunnel, a pass, a wall of fog, a dust storm, a blizzard, a curtain of rain, a long bridge).
 *
 * The shuffle deals the fifty one after another, each time at random among those not yet come that keep its rules:
 *   1. no look-alikes close together: none of a family within FAMILY_GAP of another (never the very next one);
 *   2. no run of thresholds: after MAX_THRESHOLDS thresholds running, the next must be a near enough neighbour;
 *   3. a gentle start: a journey's very first stretch is one of the gentle ones (an option, docs/V3/STATUS.md
 *      question 2 of approval A).
 * When nothing left keeps them, the second is let go, then the gap of the first is narrowed (never to nothing).
 * The ones whose families have most left to place are drawn a little more often, so that no family is left to
 * crowd the end of a round; the ones with a show at night or at dawn a little more often when the journey's
 * nominal clock (its start, and an even 70 km/h) would bring them in at that hour.
 *
 * Pure and deterministic: a round's order is a function of the seed, the round and the end of the round before;
 * a save keeps only the seed and how far along it is. DOM-free.
 */
import { hash2 } from '../../math/rng';
import { BUFFERS, SCENES, sceneById, type BufferCard, type SceneCard, type Threshold } from './scenes';

export const FAMILY_GAP = 3;
export const MAX_THRESHOLDS = 2;
/** a scenic stretch's length (m) */
export const SCENE_LENGTH: readonly [number, number] = [5000, 7000];
/** the nominal pace the clock is reckoned at (m/h) */
const PACE = 70000;

export type JoinKind = 'ecotone' | 'buffer' | 'threshold';

export interface Join {
  kind: JoinKind;
  /** a threshold's kind */
  threshold?: Threshold;
  /** the quiet stretch in it (a buffer's, or a threshold's from heat to cold) */
  buffer?: string;
  /** its length along the road (m): an ecotone's is the blend between the two */
  length: number;
}

export interface JourneyOptions {
  /** the first stretch one of the gentle ones (default true) */
  gentleStart?: boolean;
  /** the hour the journey sets out (for the night and dawn shows; default 9) */
  startHour?: number;
}

// ---- how far apart two places are ----

const bandOrder = ['polar', 'mountain', 'plateau', 'temperate', 'eastasia', 'coast', 'desert', 'grass_tropic'] as const;

/** months apart, round the year (0 … 6) */
function monthsApart(a: number, b: number): number {
  const d = Math.abs(a - b) % 12;
  return Math.min(d, 12 - d);
}

/**
 * How far apart two scenes are, as one drives from one to the other: their warmth, their wetness, their height,
 * their seasons and their bands. Below ECOTONE they blend; below BUFFER a quiet stretch takes them across; beyond, a
 * threshold.
 */
export function apart(a: SceneCard, b: SceneCard): number {
  return Math.abs(a.temp - b.temp) / 12 + Math.abs(a.wet - b.wet) * 1.5 + Math.abs(a.alt - b.alt) * 1.5 + monthsApart(a.month, b.month) / 4 + (a.band === b.band ? 0 : 0.4);
}

export const ECOTONE = 1.45;
export const BUFFER = 3.0;
/** warmer than this apart (°C): a threshold's far side has a quiet stretch too, for the cold to come on slowly */
export const HEAT_GAP = 22;

/** the quiet stretch nearest the middle of two scenes */
export function bufferBetween(a: SceneCard, b: SceneCard): BufferCard {
  const t = (a.temp + b.temp) / 2;
  const w = (a.wet + b.wet) / 2;
  const h = (a.alt + b.alt) / 2;
  let best = BUFFERS[0];
  let bestD = Infinity;
  for (const c of BUFFERS) {
    let d = Math.abs(c.temp - t) / 12 + Math.abs(c.wet - w) * 1.5 + Math.abs(c.alt - h) * 1.5;
    // (no wood between two dry places, nothing colder than both ends or warmer than both)
    d += 3 * Math.max(0, c.wet - Math.max(a.wet, b.wet) - 0.1);
    d += Math.max(0, Math.min(a.temp, b.temp) - c.temp - 3) / 6 + Math.max(0, c.temp - Math.max(a.temp, b.temp) - 3) / 6;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** the kind of join two scenes would have (not its dice: what it is) */
export function joinKind(a: SceneCard, b: SceneCard): JoinKind {
  const d = apart(a, b);
  return d < ECOTONE ? 'ecotone' : d < BUFFER ? 'buffer' : 'threshold';
}

function dice(seed: number, a: number, b: number, salt: number): number {
  return (hash2(hash2(seed, a, salt), b, salt ^ 0x5bd1) >>> 0) / 4294967296;
}

/** the join between two scenes, its dice from the seed and its place in the journey */
export function planJoin(a: SceneCard, b: SceneCard, seed: number, at: number): Join {
  const kind = joinKind(a, b);
  const r = dice(seed, at, 0, 0x101);
  if (kind === 'ecotone') return { kind, length: 1000 + 500 * r };
  if (kind === 'buffer') return { kind, buffer: bufferBetween(a, b).id, length: 1000 + 2000 * r };
  // a threshold both can be passed by; failing one, the way into the far side (its reveal belongs to it: a desert
  // comes in through a dust storm, a rainforest through the rain), a long bridge only where both have water to span
  const both = a.doors.filter((t) => b.doors.includes(t));
  const entry = b.doors.find((t) => t !== 'bridge');
  const pool: readonly Threshold[] = both.length ? both : entry ? [entry] : a.alt >= 0.4 || b.alt >= 0.4 ? ['tunnel'] : ['fog'];
  const threshold = pool[Math.floor(dice(seed, at, 1, 0x102) * pool.length) % pool.length];
  const hot = Math.abs(a.temp - b.temp) >= HEAT_GAP;
  return { kind, threshold, ...(hot ? { buffer: bufferBetween(a, b).id } : {}), length: (hot ? 1500 : 800 + 400 * r) + (hot ? 1000 : 0) };
}

// ---- the shuffle ----

const familyOf = (c: SceneCard): readonly string[] => c.families;
const shareFamily = (a: SceneCard, b: SceneCard): boolean => a.families.some((f) => b.families.includes(f));

/** a show's hours: when the nominal clock brings a stretch in at night, or at dawn */
function hourFits(c: SceneCard, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (c.night && (h >= 19 || h < 4)) return 2;
  if (c.dawn && h >= 4.5 && h < 7.5) return 2;
  return 1;
}

/**
 * A round's order: every scene once. `before`: the end of the round before (its last few, latest last), which the
 * first of this one must keep its rules with; `km`: how far the journey is when this round begins (for the clock).
 */
export function roundOrder(seed: number, round: number, before: readonly SceneCard[], opts: JourneyOptions = {}, km = 0): SceneCard[] {
  const left = [...SCENES];
  const out: SceneCard[] = [];
  const gentle = opts.gentleStart ?? true;
  const start = opts.startHour ?? 9;
  let km0 = km;
  for (let k = 0; left.length; k++) {
    const past = [...before, ...out];
    const last = past[past.length - 1];
    // the joins running at the end: thresholds in a row
    let run = 0;
    for (let i = past.length - 1; i > 0 && joinKind(past[i - 1], past[i]) === 'threshold'; i--) run++;
    const ok = (c: SceneCard, gap: number, runs: boolean): boolean => {
      if (round === 0 && k === 0 && gentle && !c.gentle) return false;
      for (let i = 1; i <= gap && i <= past.length; i++) if (shareFamily(past[past.length - i], c)) return false;
      if (runs && last && run >= MAX_THRESHOLDS && joinKind(last, c) === 'threshold') return false;
      return true;
    };
    let pool = left.filter((c) => ok(c, FAMILY_GAP, true));
    if (!pool.length) pool = left.filter((c) => ok(c, FAMILY_GAP, false));
    for (let gap = FAMILY_GAP - 1; !pool.length && gap >= 1; gap--) pool = left.filter((c) => ok(c, gap, false));
    // (nothing keeps even the nearest gap — only a family left at the very end: whatever is left)
    if (!pool.length) pool = left;
    const hour = start + (km0 + 1000) / PACE;
    const weights = pool.map((c) => {
      // a family with many left is drawn sooner
      const crowd = c.families.reduce((m, f) => Math.max(m, left.filter((o) => o !== c && o.families.includes(f)).length), 0);
      return (1 + 0.35 * crowd) * hourFits(c, hour);
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = dice(seed, round, k, 0x51) * total;
    let pick = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= weights[i];
      if (roll < 0) {
        pick = i;
        break;
      }
    }
    const c = pool[pick];
    out.push(c);
    left.splice(left.indexOf(c), 1);
    km0 += (SCENE_LENGTH[0] + SCENE_LENGTH[1]) / 2 + 1500;
  }
  return out;
}

// ---- the journey ----

export interface Chapter {
  /** a scenic stretch, or the join after it */
  kind: 'scene' | 'join';
  scene?: SceneCard;
  join?: Join;
  /** where it begins and its length along the road (m) */
  start: number;
  length: number;
  /** which round, and its place in it */
  round: number;
  index: number;
}

/** the journey of a seed: scene, join, scene, join … laid out as far as asked */
export class Journey {
  private readonly rounds: SceneCard[][] = [];
  readonly chapters: Chapter[] = [];

  constructor(
    readonly seed: number,
    readonly opts: JourneyOptions = {},
  ) {}

  /** the round's order (rounds are laid out in turn: each keeps its rules with the end of the one before) */
  round(r: number): SceneCard[] {
    while (this.rounds.length <= r) {
      const n = this.rounds.length;
      const before = n ? this.rounds[n - 1].slice(-FAMILY_GAP) : [];
      const km = this.rounds.length * SCENES.length * 7.5;
      this.rounds.push(roundOrder(this.seed, n, before, this.opts, km * 1000));
    }
    return this.rounds[r];
  }

  /** the scenes in order, from the start: the i-th */
  scene(i: number): SceneCard {
    return this.round(Math.floor(i / SCENES.length))[i % SCENES.length];
  }

  /** chapter c (laid out as far as asked) */
  chapter(c: number): Chapter {
    while (this.chapters.length <= c) {
      const n = this.chapters.length;
      const start = n ? this.chapters[n - 1].start + this.chapters[n - 1].length : 0;
      const i = n >> 1;
      const round = Math.floor(i / SCENES.length);
      if (n % 2 === 0) {
        const len = SCENE_LENGTH[0] + (SCENE_LENGTH[1] - SCENE_LENGTH[0]) * dice(this.seed, i, 0, 0x201);
        this.chapters.push({ kind: 'scene', scene: this.scene(i), start, length: Math.round(len), round, index: i % SCENES.length });
      } else {
        const join = planJoin(this.scene(i), this.scene(i + 1), this.seed, i);
        this.chapters.push({ kind: 'join', join, start, length: Math.round(join.length), round, index: i % SCENES.length });
      }
    }
    return this.chapters[c];
  }

  /** the chapter at a point of the road (m) */
  at(s: number): Chapter {
    let c = 0;
    while (this.chapter(c).start + this.chapter(c).length <= s) c++;
    return this.chapter(c);
  }
}

/** a scene card by its id */
export function scene(id: string): SceneCard {
  const c = sceneById.get(id);
  if (!c) throw new Error(`journey: no scene ${id}`);
  return c;
}

export { familyOf };
