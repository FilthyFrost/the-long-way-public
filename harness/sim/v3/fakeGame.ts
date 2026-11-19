/**
 * A stand-in for the game in Node, for the tests of V3 modules (harness/sim/v3_module.test.ts). It holds the
 * kernel the real game holds (src/game/modcar/kernel/kernel.ts: the same class, not a copy of it) and calls it
 * at the moments the real game does (src/game/modcar/ModGame.ts — installed when the game is constructed,
 * started when it has populated itself, the three hooks of a step with the world's clock before the last of
 * them, written into every save, a new game), and gives a system a `GameContext` whose game half is a handful
 * of plain objects: a player with a walker, an environment with a sky that shows the hour, a renderer with a
 * floating origin, a UI that keeps what it was told to say. A module that only uses what the context promises
 * cannot tell the difference.
 *
 * It is not the game: nothing here walks, drives or draws. What a system needs beyond the kernel is set from
 * the test (where the player stands, what hour it is). What is the game's own and only mirrored here is where
 * in a step the kernel is called (`frame`), and how the player's pick asks the sources (`mark`, `pressE`).
 */
import { newBodyMods, newVitals, resetBodyMods } from '../../../src/core/modcar/vitals';
import type { GarageDevice } from '../../../src/game/modcar/garageStub';
import type { GameContext } from '../../../src/game/modcar/kernel/context';
import type { DevButton, DevPane } from '../../../src/game/modcar/kernel/devTabs';
import { setItemClock } from '../../../src/game/modcar/itemTime';
import { Kernel, type KernelSave } from '../../../src/game/modcar/kernel/kernel';
import type { GameModule } from '../../../src/game/modcar/kernel/modules';

/** the part of a save the stand-in writes: the hour (save.ts SaveV1 has it too) and the kernel's two parts */
export interface FakeSave extends KernelSave {
  hour: number;
}

/** how far the player's pick asks the sources (player.ts: REACH + 0.5) */
const PICK_RANGE = 3.1;

export class FakeGame {
  readonly kernel: Kernel;
  readonly events: Kernel['events'];
  readonly systems: Kernel['systems'];
  readonly slices: Kernel['slices'];
  readonly clock: Kernel['clock'];
  readonly interact: Kernel['interact'];
  readonly devTabs: Kernel['devTabs'];
  readonly modal: Kernel['modal'];
  /** every report of the kernel, as the test hook's last error would be told of it (ModGame: kernel.onError) */
  readonly reports: string[] = [];
  /** what the kernel wrote out: a fault the first time it is seen ('error: …'), a line worth a note ('warn: …') */
  readonly written: string[] = [];
  /** what the UI was told to say: the systems' own lines, and the kernel's when it sets a fault apart */
  readonly said: string[] = [];
  /** the sounds the systems asked for, by name */
  readonly sounds: string[] = [];
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
    restore: FakeSave | null = null,
    opts: { seed?: number; hour?: number } = {},
  ) {
    this.kernel = new Kernel({
      now: () => this.nowMs,
      say: (text) => void this.said.push(text),
      out: { error: (text) => void this.written.push(`error: ${text}`), warn: (text) => void this.written.push(`warn: ${text}`) },
    });
    this.kernel.onError = (message) => void this.reports.push(message);
    this.events = this.kernel.events;
    this.systems = this.kernel.systems;
    this.slices = this.kernel.slices;
    this.clock = this.kernel.clock;
    this.interact = this.kernel.interact;
    this.devTabs = this.kernel.devTabs;
    this.modal = this.kernel.modal;
    // (ModGame: things that go off read the world's clock — itemTime.ts itemNow; the last game made sets it)
    setItemClock(this.kernel.clock);
    this.sky.hour = restore ? restore.hour : (opts.hour ?? 9.2);
    const game = this;
    this.ctx = {
      events: this.events,
      systems: this.systems,
      slices: this.slices,
      clock: this.clock,
      interact: this.interact,
      devTabs: this.devTabs,
      modal: this.modal,
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
      sound: (name: string) => void this.sounds.push(name),
      // (the body is the game's: nothing here steps it; a test steps it with the mods as the game does)
      body: newVitals(),
      bodyMods: newBodyMods(),
    };
    // (ModGame's constructor: the journey begins at the hour the page starts at, or goes on from the save's clock)
    this.kernel.install(modules, this.ctx, this.sky.hour, restore);
  }

  /** the timing's clock moved on (called from inside a hook: that hook took this long) */
  passes(ms: number): void {
    this.nowMs += ms;
  }

  /** the game has populated itself: the systems set up, the save's slices read back, the start announced (ModGame: `ready`) */
  async start(): Promise<this> {
    await this.kernel.start(this.ctx);
    return this;
  }

  /**
   * One step of the game as far as the kernel is in it (ModGame.step and updateViews): the session's seconds go
   * on, the modal open is shut if one sits or has walked away, what lasts on the body is made neutral, then
   * preStep, then step, then the world's clock is brought up to the hour, then lateUpdate.
   */
  frame(dt = 1 / 60): void {
    this.time += dt;
    this.modal.step(!!this.seated);
    resetBodyMods(this.ctx.bodyMods);
    this.systems.preStep(dt, this.ctx);
    this.systems.step(dt, this.ctx);
    this.kernel.tick(this.sky, this);
    this.systems.lateUpdate(dt, this.ctx);
  }

  /** the hour set by hand, seen by the next frame (the developer's panel; the test hook's setHour then steps once) */
  setHour(hour: number): void {
    this.sky.hour = hour;
    this.frame(0);
  }

  /** the save as the game would write it now (ModGame.snapshot: the hour, and the kernel's parts) */
  snapshot(): FakeSave {
    const s: FakeSave = { hour: this.sky.hour };
    this.kernel.write(s);
    return s;
  }

  /** the save as its text gives it back (what a reload reads) */
  saved(): FakeSave {
    return JSON.parse(JSON.stringify(this.snapshot())) as FakeSave;
  }

  /** a new game asked for (ModGame.newGame, up to where the page is opened again) */
  newGame(): void {
    this.kernel.newGame(this.sky.hour);
    this.kernel.dispose();
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
    this.interact.near(eye, PICK_RANGE, near);
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
