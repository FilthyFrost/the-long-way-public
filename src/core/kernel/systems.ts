/**
 * The systems of the V3 kernel (docs/V3/nodes/N0-foundation.md): a gameplay system is an object with an id and
 * the hooks it wants, and the registry runs every system's hooks at fixed places of the frame.
 *
 *   init        once, in order, after the game has set itself up (may be asynchronous)
 *   preStep     every frame, before the body, the player and the vehicles are stepped
 *   step        every frame, after the vehicles and the loose things have moved, before any view work
 *   lateUpdate  every frame, once the camera, the floating origin and this frame's weather are final
 *   dispose     once, in reverse order
 *
 * The order is the order of registration, except that a system named in another's `after` comes first. Every
 * call is wrapped: a system that throws is reported (id, phase, error) and the frame goes on with the others.
 * Every call is timed with the clock handed in (nothing here reads a clock of its own): per system and phase a
 * smoothed time and the longest seen, and the frame's total against the budget the system declared.
 *
 * Pure: no three, no DOM. The three per-frame calls allocate nothing.
 */

export type SystemPhase = 'init' | 'preStep' | 'step' | 'lateUpdate' | 'dispose' | 'telemetry';

/** what a system may cost (docs/V3/LOOP_V2.md, the performance contract) */
export interface SystemBudget {
  /** processor time in one frame, its three phases together (ms) */
  readonly cpuMs: number;
}

/** a function a test script may call by name (any arguments, any result) */
export type HarnessFn = (...args: never[]) => unknown;

export interface System<C> {
  /** unique among the systems: lower-case letters, digits, '_', '-', '.', ':' */
  readonly id: string;
  /** ids of the systems that must be set up, and run in every phase, before this one */
  readonly after?: readonly string[];
  readonly budget?: SystemBudget;
  /** once, before the first frame; a system whose init throws or rejects is reported and never run */
  init?(ctx: C): void | Promise<void>;
  /** every frame; must stand dt = 0 (the test harness steps with it), so never divide by dt */
  preStep?(dt: number, ctx: C): void;
  step?(dt: number, ctx: C): void;
  lateUpdate?(dt: number, ctx: C): void;
  dispose?(): void;
  /** what it says of itself to the test hook: plain data, built when asked for */
  telemetry?(): Record<string, unknown>;
  /** named functions for test scripts (SystemRegistry.harness) */
  readonly harness?: Readonly<Record<string, HarnessFn>>;
}

/** a system's times (ms): its three phases and the three together */
export interface SystemTimes {
  pre: number;
  step: number;
  late: number;
  total: number;
}

/** what the registry knows of one system, as plain data */
export interface SystemReport {
  /** smoothed over about twenty frames */
  ms: SystemTimes;
  /** the longest seen since the start, or since resetTimings() */
  max: SystemTimes;
  /** the budget it declared (ms a frame); null: none */
  budgetMs: number | null;
  /** its smoothed total is over its budget now */
  over: boolean;
  /** of the frames counted, those whose total was over its budget */
  frames: number;
  overFrames: number;
  /** times it threw, in any phase */
  errors: number;
  /** its init failed: it is not run */
  failed: boolean;
  /** what the system says of itself (null: nothing) */
  own: Record<string, unknown> | null;
}

export interface SystemRegistryOptions {
  /** a clock in milliseconds for the timing (the browser's performance clock; a counter in tests) */
  now: () => number;
  /** told of every throw; null: nobody is told */
  onError?: ((id: string, phase: SystemPhase, error: unknown) => void) | null;
}

const ID = /^[a-z][a-z0-9_.:-]*$/;
/** how much of a new frame's time goes into the smoothed value */
const SMOOTH = 0.05;
const PHASES: readonly SystemPhase[] = ['preStep', 'step', 'lateUpdate'];

// (a system's numbers, in one array each so that the frame writes into memory that is already there)
const F_PRE = 0; // this frame, by phase
const S_PRE = 3; // smoothed, by phase, then the total
const S_TOTAL = 6;
const M_PRE = 7; // the longest, by phase, then the total
const M_TOTAL = 10;
const SLOTS = 11;

class Entry<C> {
  state: 'added' | 'live' | 'failed' | 'disposed' = 'added';
  readonly t = new Float64Array(SLOTS);
  /** ms a frame allowed; −1: no budget */
  readonly budget: number;
  frames = 0;
  overFrames = 0;
  errors = 0;

  constructor(readonly sys: System<C>) {
    const b = sys.budget?.cpuMs;
    this.budget = b !== undefined && b >= 0 ? b : -1;
  }
}

export class SystemRegistry<C> {
  /** told of every throw: which system, in which phase, what */
  onError: ((id: string, phase: SystemPhase, error: unknown) => void) | null;
  private readonly now: () => number;
  private readonly entries: Entry<C>[] = [];
  private readonly byId = new Map<string, Entry<C>>();
  /** the systems in the order they run, once init has worked it out */
  private order: Entry<C>[] | null = null;
  /** the ones set up and running, and of those the ones with each phase */
  private live: Entry<C>[] = [];
  private pre: Entry<C>[] = [];
  private steps: Entry<C>[] = [];
  private late: Entry<C>[] = [];
  private started = false;
  private disposed = false;

  constructor(opts: SystemRegistryOptions) {
    this.now = opts.now;
    this.onError = opts.onError ?? null;
  }

  /** how many systems there are */
  get size(): number {
    return this.entries.length;
  }

  /** register a system (before init; a second one with the same id throws) */
  add(sys: System<C>): void {
    if (typeof sys.id !== 'string' || !ID.test(sys.id)) throw new Error(`a system's id must be lower-case letters, digits and _ - . : beginning with a letter, not '${String(sys.id)}'`);
    if (this.byId.has(sys.id)) throw new Error(`a system with the id '${sys.id}' is already registered`);
    if (this.started) throw new Error(`the system '${sys.id}' comes too late: the systems have been set up already`);
    const e = new Entry(sys);
    this.entries.push(e);
    this.byId.set(sys.id, e);
  }

  get<T extends System<C> = System<C>>(id: string): T | undefined {
    return this.byId.get(id)?.sys as T | undefined;
  }

  /**
   * The ids in the order the systems are set up and run: the order they were registered in, a system named in
   * another's `after` moved before it. Throws when an `after` names a system that is not there, or when
   * systems wait for each other in a circle.
   */
  ids(): string[] {
    return (this.order ?? this.sorted()).map((e) => e.sys.id);
  }

  private sorted(): Entry<C>[] {
    for (const e of this.entries) {
      for (const a of e.sys.after ?? []) {
        if (!this.byId.has(a)) throw new Error(`the system '${e.sys.id}' is to come after '${a}', but no system with that id is registered (there are: ${this.entries.map((x) => x.sys.id).join(', ')})`);
      }
    }
    const placed = new Set<string>();
    const rest = [...this.entries];
    const out: Entry<C>[] = [];
    while (rest.length) {
      // (the first registered whose predecessors are all placed: the order of registration wherever `after` does not say otherwise)
      const i = rest.findIndex((e) => (e.sys.after ?? []).every((a) => placed.has(a)));
      if (i < 0) throw new Error(`systems wait for each other in a circle: ${circle(rest)}`);
      const e = rest.splice(i, 1)[0];
      out.push(e);
      placed.add(e.sys.id);
    }
    return out;
  }

  /**
   * Set every system up, one after the other in order (each waits for the one before it). Until this has
   * finished the per-frame calls do nothing. A system whose init throws or rejects is reported and left out
   * from then on; the promise itself only rejects for a mistake in the order (see ids()).
   */
  async init(ctx: C): Promise<void> {
    if (this.started) throw new Error('the systems have been set up already');
    const order = this.sorted();
    this.started = true;
    this.order = order;
    const live: Entry<C>[] = [];
    for (const e of order) {
      if (this.disposed) break;
      try {
        await e.sys.init?.(ctx);
      } catch (error) {
        e.state = 'failed';
        e.errors++;
        this.report(e.sys.id, 'init', error);
        continue;
      }
      // (taken down while this one was setting itself up: it goes at once)
      if (this.disposed) {
        this.drop(e);
        break;
      }
      e.state = 'live';
      live.push(e);
    }
    if (this.disposed) {
      for (let i = live.length - 1; i >= 0; i--) this.drop(live[i]);
      return;
    }
    this.live = live;
    this.pre = live.filter((e) => !!e.sys.preStep);
    this.steps = live.filter((e) => !!e.sys.step);
    this.late = live.filter((e) => !!e.sys.lateUpdate);
  }

  preStep(dt: number, ctx: C): void {
    this.run(0, this.pre, dt, ctx);
  }

  step(dt: number, ctx: C): void {
    this.run(1, this.steps, dt, ctx);
  }

  /** the last of a frame's three: the frame's times are added up and counted here */
  lateUpdate(dt: number, ctx: C): void {
    this.run(2, this.late, dt, ctx);
    const live = this.live;
    for (let i = 0; i < live.length; i++) fold(live[i]);
  }

  private run(phase: 0 | 1 | 2, list: Entry<C>[], dt: number, ctx: C): void {
    const n = list.length;
    if (n === 0) return;
    const now = this.now;
    let t0 = now();
    for (let i = 0; i < n; i++) {
      const e = list[i];
      try {
        if (phase === 0) e.sys.preStep!(dt, ctx);
        else if (phase === 1) e.sys.step!(dt, ctx);
        else e.sys.lateUpdate!(dt, ctx);
      } catch (error) {
        e.errors++;
        this.report(e.sys.id, PHASES[phase], error);
      }
      // (one reading between two systems: the end of one is the start of the next)
      const t1 = now();
      e.t[F_PRE + phase] += t1 - t0;
      t0 = t1;
    }
  }

  /** take every system down, the last set up first; nothing runs afterwards. A second call does nothing. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const live = this.live;
    this.live = [];
    this.pre = [];
    this.steps = [];
    this.late = [];
    for (let i = live.length - 1; i >= 0; i--) this.drop(live[i]);
  }

  private drop(e: Entry<C>): void {
    e.state = 'disposed';
    try {
      e.sys.dispose?.();
    } catch (error) {
      e.errors++;
      this.report(e.sys.id, 'dispose', error);
    }
  }

  /** the times and counts from here on (a test measures a stretch of frames with it) */
  resetTimings(): void {
    for (const e of this.entries) {
      e.t.fill(0);
      e.frames = 0;
      e.overFrames = 0;
    }
  }

  /** every system, in order: its times against its budget, its errors, what it says of itself (plain data) */
  telemetry(): Record<string, SystemReport> {
    const out: Record<string, SystemReport> = {};
    for (const e of this.order ?? this.entries) {
      const t = e.t;
      let own: Record<string, unknown> | null = null;
      // (only of a system that is up: one not yet set up, failed or taken down has nothing sound to say)
      if (e.sys.telemetry && e.state === 'live') {
        try {
          own = e.sys.telemetry();
        } catch (error) {
          e.errors++;
          this.report(e.sys.id, 'telemetry', error);
        }
      }
      out[e.sys.id] = {
        ms: { pre: t[S_PRE], step: t[S_PRE + 1], late: t[S_PRE + 2], total: t[S_TOTAL] },
        max: { pre: t[M_PRE], step: t[M_PRE + 1], late: t[M_PRE + 2], total: t[M_TOTAL] },
        budgetMs: e.budget >= 0 ? e.budget : null,
        over: e.budget >= 0 && t[S_TOTAL] > e.budget,
        frames: e.frames,
        overFrames: e.overFrames,
        errors: e.errors,
        failed: e.state === 'failed',
        own,
      };
    }
    return out;
  }

  /** call one of a system's harness functions by name (test scripts); throws when there is none */
  harness(id: string, name: string, ...args: unknown[]): unknown {
    const sys = this.byId.get(id)?.sys;
    if (!sys) throw new Error(`no system '${id}' (there are: ${this.entries.map((x) => x.sys.id).join(', ')})`);
    const fn = sys.harness?.[name] as ((...a: unknown[]) => unknown) | undefined;
    if (typeof fn !== 'function') throw new Error(`the system '${id}' has no harness function '${name}' (it has: ${Object.keys(sys.harness ?? {}).join(', ')})`);
    return fn(...args);
  }

  private report(id: string, phase: SystemPhase, error: unknown): void {
    this.onError?.(id, phase, error);
  }
}

/** a frame's times of one system into its smoothed values, its longest and its counts */
function fold<C>(e: Entry<C>): void {
  const t = e.t;
  const total = t[F_PRE] + t[F_PRE + 1] + t[F_PRE + 2];
  const first = e.frames === 0;
  for (let k = 0; k < 3; k++) {
    const v = t[F_PRE + k];
    t[S_PRE + k] = first ? v : t[S_PRE + k] + (v - t[S_PRE + k]) * SMOOTH;
    if (v > t[M_PRE + k]) t[M_PRE + k] = v;
    t[F_PRE + k] = 0;
  }
  t[S_TOTAL] = first ? total : t[S_TOTAL] + (total - t[S_TOTAL]) * SMOOTH;
  if (total > t[M_TOTAL]) t[M_TOTAL] = total;
  e.frames++;
  if (e.budget >= 0 && total > e.budget) e.overFrames++;
}

/** one circle among systems that cannot be ordered, as "a → b → a" */
function circle<C>(rest: Entry<C>[]): string {
  const ids = new Set(rest.map((e) => e.sys.id));
  const next = (id: string): string => (rest.find((e) => e.sys.id === id)?.sys.after ?? []).find((a) => ids.has(a)) ?? id;
  // (walk the waits from anywhere until a system comes up twice: from there on it is the circle)
  const seen: string[] = [];
  let id = rest[0].sys.id;
  while (!seen.includes(id)) {
    seen.push(id);
    id = next(id);
  }
  return [...seen.slice(seen.indexOf(id)), id].join(' → ');
}
