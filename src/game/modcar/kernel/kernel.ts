/**
 * The V3 kernel as a game owns it (docs/V3/nodes/N0-foundation.md): the six things a system plugs into — the
 * event bus, the system registry, the save slices, the world clock, the interactable sources and the developer
 * tabs — and what is done with them at the game's fixed moments: the modules installed when the game is
 * constructed, the systems set up and the save's slices read back once the game has populated itself, the
 * world's clock brought up to the hour every frame, the slices and the clock put into every save, everything
 * begun again for a new game, and whatever goes wrong in any of it reported and set apart.
 *
 * ModGame holds one and calls it at those moments; the three hooks of the frame it calls on `systems` itself.
 * The tests' stand-in for the game (harness/sim/v3/fakeGame.ts) holds one too, so what is tested in Node is
 * this code and not a copy of it.
 *
 * No three, no DOM, and nothing of the bundler's (the modules are found in kernel/discovery.ts, which only the
 * page's entry imports): this file runs in plain Node.
 */
import { WorldClock, type ClockSave, type HourHand, type SessionTime } from '../../../core/kernel/clock';
import { EventBus, NOTHING, type GameEvents } from '../../../core/kernel/events';
import { SaveSliceRegistry, type SliceRecord } from '../../../core/kernel/slices';
import { SystemRegistry } from '../../../core/kernel/systems';
import type { GameContext } from './context';
import { DevTabs } from './devTabs';
import { InteractSources } from './interact';
import { installModules, type GameModule, type ModuleParts } from './modules';

/** the two parts of a save that are the kernel's (save.ts SaveV1 has them, both optional) */
export interface KernelSave {
  slices?: SliceRecord;
  clock?: ClockSave;
}

export interface KernelOptions {
  /** a clock in milliseconds for the systems' timing (the browser's performance clock; a counter in tests) */
  now: () => number;
  /** a line for the player, shown for so many seconds (the game's toast); absent: nothing is said on screen */
  say?: (text: string, seconds: number) => void;
  /** where a fault is written the first time it is seen, and where a line worth a note goes; absent: the console */
  out?: { error(text: string, error?: unknown): void; warn(text: string): void };
}

/** what the player is told when a fault was set apart (the words the game's own loop uses for a frame that threw) */
const SKIPPED = '出了个小错，已跳过，游戏继续。';

/**
 * How many kinds of fault are written out and said, each once; the kinds beyond are only counted. (A message
 * with a number in it that changes is a new kind every time: without an end to it one broken system could
 * still write every frame.)
 */
const SAID_MAX = 24;

export class Kernel {
  /** what happened, said and heard: the systems' events and the game's own (kernel/context.ts lists those) */
  readonly events = new EventBus<GameEvents>();
  /** the systems and their hooks in the frame (preStep, step, lateUpdate), each timed against its budget */
  readonly systems: SystemRegistry<GameContext>;
  /** each system's part of the save */
  readonly slices = new SaveSliceRegistry();
  /** the world's time: saved, never backwards; it follows the hour the environment shows (tick) */
  readonly clock = new WorldClock();
  /** things in the world the mark finds and E works, from the systems (the player's pick asks it) */
  readonly interact = new InteractSources();
  /** the systems' tabs of the developer's panel */
  readonly devTabs = new DevTabs();
  /** the last thing reported going wrong and set apart (a system, a listener, a slice, a module, a device), and how many reports there were in all */
  readonly log = { last: '', count: 0 };
  /** told of every report (entry.ts: the test hook's lastError) */
  onError: ((message: string) => void) | null = null;

  private readonly say: ((text: string, seconds: number) => void) | null;
  private readonly out: { error(text: string, error?: unknown): void; warn(text: string): void };
  /** what each module brought, in the order they were installed */
  private parts: ModuleParts[] = [];
  /** the save being taken up; null: a new game */
  private saved: KernelSave | null = null;
  /** the systems are set up and the slices have taken their parts of the save back (start is through) */
  private read = false;
  /** the kinds of fault written out and said so far */
  private readonly said = new Set<string>();

  constructor(opts: KernelOptions) {
    this.systems = new SystemRegistry<GameContext>({ now: opts.now });
    this.say = opts.say ?? null;
    this.out = opts.out ?? { error: (text, error) => console.error(text, error), warn: (text) => console.warn(text) };
    this.events.onError = (type, e) => this.report(`event ${type}`, e);
    this.systems.onError = (id, phase, e) => this.report(`system ${id} (${phase})`, e);
    this.interact.onError = (e, where) => this.report(where ?? 'interactable source', e);
    this.slices.onReport = (r) => {
      // (a record kept as it came — nobody here reads it, a newer build wrote it, or its system is not running —
      // is worth a line, not an error)
      if (r.what === 'unknown') this.out.warn(`[kernel] save slice ${r.id} (version ${r.v}) is not known to this build: kept unread`);
      else if (r.what === 'newer') this.out.warn(`[kernel] save slice ${r.id} (version ${r.v}) is from a newer build: kept unread`);
      else if (r.what === 'held') this.out.warn(`[kernel] save slice ${r.id} (version ${r.v}) is kept unread: its system is not running`);
      else this.report(`save slice ${r.id} (${r.what})`, r.error ?? new Error('not a slice'));
    };
  }

  /**
   * The game is being constructed: the world's clock set — a journey begins at `hour`, the hour the page starts
   * at; a save with a clock goes on from its own — and the modules installed in order, each handed the game as
   * its context. `saved` is the save being taken up (its `slices` and `clock` are the kernel's), null for a
   * new game. Nothing has been stepped yet, and the vehicles are not there.
   */
  install(modules: readonly GameModule[], ctx: GameContext, hour: number, saved: KernelSave | null): void {
    this.saved = saved;
    this.clock.begin(hour);
    if (saved?.clock !== undefined && !this.clock.restore(saved.clock)) this.report('world clock', new Error('the clock in the save does not read: begun again at this hour'));
    this.parts = installModules(modules, ctx, (id, e) => this.report(`module ${id}`, e));
  }

  /**
   * The game has populated itself (the garage, the vehicles and the things lying about are there): the systems
   * are set up, each waiting for the one before it; then every slice takes its part of the save back — or, with
   * no save, stays as a new game starts — and the game says which of the two this is.
   *
   * A system that did not come up (its init threw, or the order of the systems cannot be) can neither take its
   * state back nor give it out: the slices its module brought are set aside before the save is read, their
   * records kept as they came for the day it runs again.
   */
  async start(ctx: GameContext): Promise<void> {
    try {
      await this.systems.init(ctx);
    } catch (e) {
      // (an order that cannot be: no system runs, the game does)
      this.report('systems', e);
    }
    for (const p of this.parts) {
      if (p.systems.every((id) => this.systems.isLive(id))) continue;
      for (const id of p.slices) this.slices.hold(id);
    }
    const saved = this.saved;
    if (saved) this.slices.restore(saved.slices);
    this.read = true;
    this.events.emit(saved ? 'game:restored' : 'game:new', NOTHING);
  }

  /**
   * Once a frame, when the environment has fixed this frame's hour: the world's clock brought up to it, and a
   * whole hour or a midnight passed said. `session` is whatever counts the session's seconds (the game).
   */
  tick(hand: HourHand, session: SessionTime): void {
    const c = this.clock;
    if (!c.sync(hand, session) || c.hoursCrossed === 0) return;
    if (c.daysCrossed > 0) this.events.emit('clock:day', { day: c.day, crossed: c.daysCrossed });
    this.events.emit('clock:hour', { day: c.day, hour: c.hour | 0, crossed: c.hoursCrossed });
  }

  /**
   * The kernel's parts put into a save that is being written: the systems' slices, where any has something to
   * keep, and the world's clock. A save written while the page is still loading, before the slices have taken
   * their parts back, keeps the parts it was loaded with.
   */
  write(save: KernelSave): void {
    const slices = this.read ? this.slices.snapshot() : this.saved?.slices;
    if (slices) save.slices = slices;
    save.clock = this.clock.snapshot();
  }

  /** a new game was asked for: every slice as a new game starts, the world's clock at nothing from `hour`, and said */
  newGame(hour: number): void {
    this.saved = null;
    this.slices.clear();
    this.clock.begin(hour);
    this.events.emit('game:new', NOTHING);
  }

  /** the systems taken down, the last set up first */
  dispose(): void {
    this.systems.dispose();
  }

  /**
   * Something went wrong and was set apart: counted and kept as the last error, and — the first time this kind
   * of fault is seen — written out and said to the player in a line (`words`; the plain "skipped" by default).
   */
  report(where: string, e: unknown, words: string = SKIPPED): void {
    let what: string;
    try {
      what = e instanceof Error ? e.message : String(e);
    } catch {
      what = 'something that cannot be put into words';
    }
    const message = `${where}: ${what}`;
    this.log.count++;
    this.log.last = message;
    if (!this.said.has(message) && this.said.size < SAID_MAX) {
      this.said.add(message);
      this.out.error(`[kernel] ${where}`, e);
      this.say?.(words, 3);
      if (this.said.size === SAID_MAX) this.out.warn(`[kernel] ${SAID_MAX} kinds of fault so far: further kinds are only counted`);
    }
    this.onError?.(message);
  }

  /** for the test hook: the modules, each system's times against its budget, the slices, the clock, what was last reported */
  telemetry(): Record<string, unknown> {
    const c = this.clock;
    return {
      modules: this.parts.map((p) => p.id),
      systems: this.systems.telemetry(),
      slices: this.slices.telemetry(),
      clock: { worldSeconds: c.worldSeconds, day: c.day, hour: c.hour, startHour: c.startHour, waiting: c.waiting },
      interact: this.interact.size,
      devTabs: this.devTabs.list().map((t) => t.id),
      lastError: this.log.last,
      errors: this.log.count,
    };
  }
}
