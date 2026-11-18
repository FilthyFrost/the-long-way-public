/**
 * A stand-in for the game in Node, for the tests of V3 modules (harness/sim/v3_module.test.ts): it owns the
 * kernel's objects and drives them in the order the real game does (src/game/modcar/ModGame.ts — startKernel,
 * startSystems, the three hooks of step and updateViews, tickClock, snapshot, newGame; the names below are the
 * same), and gives a system a `GameContext` whose game half is a handful of plain objects: a player with a
 * walker, an environment with a sky that shows the hour, a renderer with a floating origin, a UI that keeps
 * what it was told to say. A module that only uses what the context promises cannot tell the difference.
 *
 * It is not the game: nothing here walks, drives or draws. What a system needs beyond the kernel is set from
 * the test (where the player stands, what hour it is).
 */
import { WorldClock, type ClockSave } from '../../../src/core/kernel/clock';
import { EventBus, NOTHING, type GameEvents } from '../../../src/core/kernel/events';
import { SaveSliceRegistry, type SliceRecord } from '../../../src/core/kernel/slices';
import { SystemRegistry } from '../../../src/core/kernel/systems';
import type { GarageDevice } from '../../../src/game/modcar/garageStub';
import type { GameContext } from '../../../src/game/modcar/kernel/context';
import { DevTabs, type DevButton, type DevPane } from '../../../src/game/modcar/kernel/devTabs';
import { InteractSources } from '../../../src/game/modcar/kernel/interact';
import { installModules, type GameModule } from '../../../src/game/modcar/kernel/modules';

/** the part of a save the kernel writes (save.ts SaveV1 has the same two fields) */
export interface KernelSave {
  hour: number;
  slices?: SliceRecord;
  clock?: ClockSave;
}

/** how far the player's pick asks the sources (player.ts: REACH + 0.5) */
const PICK_RANGE = 3.1;

export class FakeGame {
  readonly events = new EventBus<GameEvents>();
  readonly systems: SystemRegistry<GameContext>;
  readonly slices = new SaveSliceRegistry();
  readonly clock = new WorldClock();
  readonly interact = new InteractSources();
  readonly devTabs = new DevTabs();
  /** what the kernel reported (ModGame.kernelReport) */
  readonly reports: string[] = [];
  /** what the UI was told to say */
  readonly said: string[] = [];
  /** the timing's clock (ms), moved by hand: `passes(ms)` inside a hook is what that hook cost */
  private nowMs = 0;
  /** the session's seconds (ModGame.time) */
  time = 0;
  // ---- the game half of the context: plain objects with the few members a system may read
  readonly sky = { hour: 9.2 };
  readonly walker = { x: 0, y: 0, z: 0, heading: 0 };
  readonly origin = { x: 0, y: 0, z: 0 };
  seated: GameContext['seated'] = null;
  readonly ctx: GameContext;
  private readonly nearDevices: GarageDevice[] = [];

  constructor(
    modules: readonly GameModule[],
    private readonly restore: KernelSave | null = null,
    opts: { seed?: number; hour?: number } = {},
  ) {
    this.systems = new SystemRegistry<GameContext>({ now: () => this.nowMs });
    this.sky.hour = restore ? restore.hour : (opts.hour ?? 9.2);
    const game = this;
    this.ctx = {
      events: this.events,
      systems: this.systems,
      slices: this.slices,
      clock: this.clock,
      interact: this.interact,
      devTabs: this.devTabs,
      params: { seed: opts.seed ?? 1, shot: false, keep: true } as GameContext['params'],
      core: { origin: this.origin } as GameContext['core'],
      env: { sky: this.sky } as GameContext['env'],
      world: null,
      player: { walker: this.walker } as GameContext['player'],
      vehicles: [],
      get seated() {
        return game.seated;
      },
      loose: {} as GameContext['loose'],
      ui: { say: (text: string) => void this.said.push(text) } as GameContext['ui'],
    };
    // (ModGame.startKernel)
    this.events.onError = (type, e) => this.report(`event ${type}`, e);
    this.systems.onError = (id, phase, e) => this.report(`system ${id} (${phase})`, e);
    this.interact.onError = (e) => this.report('interactable source', e);
    this.slices.onReport = (r) => {
      if (r.what !== 'unknown' && r.what !== 'newer') this.report(`save slice ${r.id} (${r.what})`, r.error ?? new Error('not a slice'));
    };
    this.clock.begin(this.sky.hour);
    if (restore?.clock !== undefined && !this.clock.restore(restore.clock)) this.report('world clock', new Error('the clock in the save does not read'));
    installModules(modules, this.ctx, (id, e) => this.report(`module ${id}`, e));
  }

  private report(where: string, e: unknown): void {
    this.reports.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** the timing's clock moved on (called from inside a hook: that hook took this long) */
  passes(ms: number): void {
    this.nowMs += ms;
  }

  /** the systems set up, then the save's slices read back, then the game says which start this is (ModGame.startSystems) */
  async start(): Promise<this> {
    try {
      await this.systems.init(this.ctx);
    } catch (e) {
      this.report('systems', e);
    }
    if (this.restore) {
      this.slices.restore(this.restore.slices);
      this.events.emit('game:restored', NOTHING);
    } else this.events.emit('game:new', NOTHING);
    return this;
  }

  /** one step of the game: the three hooks, and the world's clock before the last of them (ModGame.step, updateViews, tickClock) */
  frame(dt = 1 / 60): void {
    this.time += dt;
    this.systems.preStep(dt, this.ctx);
    this.systems.step(dt, this.ctx);
    const c = this.clock;
    if (c.sync(this.sky, this) && c.hoursCrossed > 0) {
      if (c.daysCrossed > 0) this.events.emit('clock:day', { day: c.day, crossed: c.daysCrossed });
      this.events.emit('clock:hour', { day: c.day, hour: c.hour | 0, crossed: c.hoursCrossed });
    }
    this.systems.lateUpdate(dt, this.ctx);
  }

  /** the hour set by hand, seen by the next frame (the developer's panel; the test hook's setHour then steps once) */
  setHour(hour: number): void {
    this.sky.hour = hour;
    this.frame(0);
  }

  /** what the kernel puts into the save (ModGame.snapshot) */
  snapshot(): KernelSave {
    const s: KernelSave = { hour: this.sky.hour };
    const slices = this.slices.snapshot();
    if (slices) s.slices = slices;
    s.clock = this.clock.snapshot();
    return s;
  }

  /** the save as its text gives it back (what a reload reads) */
  saved(): KernelSave {
    return JSON.parse(JSON.stringify(this.snapshot())) as KernelSave;
  }

  /** a new game asked for (ModGame.newGame, up to where the page is opened again) */
  newGame(): void {
    this.slices.clear();
    this.clock.begin(this.sky.hour);
    this.events.emit('game:new', NOTHING);
    this.systems.dispose();
  }

  /**
   * What the mark would be on, the way the player's pick finds a device (player.ts markDevice): the sources are
   * asked for what is near the eye, and of those the nearest whose point the line of sight passes within its radius.
   * The eye is the walker's, 1.6 m up, looking along `heading` (and `pitch` up).
   */
  mark(pitch = 0): GarageDevice | null {
    const w = this.walker;
    const eye = { x: w.x, y: w.y + 1.6, z: w.z };
    const dir = { x: Math.cos(w.heading) * Math.cos(pitch), y: Math.sin(pitch), z: Math.sin(w.heading) * Math.cos(pitch) };
    if (this.interact.empty) return null;
    const near = this.nearDevices;
    while (near.length > 0) near.pop();
    this.interact.near(eye.x, eye.z, PICK_RANGE, near);
    let best: GarageDevice | null = null;
    let bd = Infinity;
    for (const dv of near) {
      const dx = dv.x - eye.x;
      const dy = dv.y - eye.y;
      const dz = dv.z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > PICK_RANGE) continue;
      const along = (dx * dir.x + dy * dir.y + dz * dir.z) / d;
      if (Math.sqrt(Math.max(0, 1 - along * along)) * d < dv.radius && d < bd) {
        bd = d;
        best = dv;
      }
    }
    return best;
  }

  /** stand `back` metres short of a point, facing it, the eye level with it */
  standBefore(x: number, y: number, z: number, back = 1.2): void {
    this.walker.x = x - back;
    this.walker.z = z;
    this.walker.y = y - 1.6;
    this.walker.heading = 0;
  }

  /**
   * E on what the mark is on, as the player's act does it (player.ts): a press uses it at once, unless it wants
   * E held — then `seconds` of holding, its progress told every frame, and it is used when the hold is full.
   * True when it was used.
   */
  pressE(seconds = 0): boolean {
    const dv = this.mark();
    if (!dv) return false;
    if (!dv.holdS) {
      dv.use();
      return true;
    }
    let p = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      p += 1 / 60 / dv.holdS;
      dv.holding?.(Math.min(1, p));
      if (p >= 1) {
        dv.use();
        return true;
      }
    }
    return false;
  }

  /** a tab built as the developer's panel builds it, into a pane that only writes down what it was asked to make */
  openTab(id: string): { made: string[]; buttons: DevButton[]; box: { textContent: string | null } | null; message: string } | null {
    const tab = this.devTabs.get(id);
    if (!tab) return null;
    const out = { made: [] as string[], buttons: [] as DevButton[], box: null as { textContent: string | null } | null, message: '' };
    const el = (kind: string, text: string): HTMLElement => {
      const e = { textContent: text };
      out.made.push(`${kind}: ${text}`);
      return e as unknown as HTMLElement;
    };
    const pane: DevPane = {
      el: {} as HTMLElement,
      body: {} as HTMLElement,
      heading: (text) => el('heading', text),
      note: (text) => el('note', text),
      buttons: (list) => {
        out.buttons.push(...list);
        return el('buttons', list.map((b) => b.label).join(' | '));
      },
      box: (text = '') => {
        const e = el('box', text);
        out.box = e;
        return e;
      },
      message: () => (text) => void (out.message = text),
    };
    tab.build(pane);
    return out;
  }
}
