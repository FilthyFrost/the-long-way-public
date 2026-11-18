/**
 * An example module for the V3 kernel (docs/V3/nodes/N0-foundation.md), used only by the tests
 * (harness/sim/v3_module.test.ts). It is shaped exactly like a real one — src/game/modcar/v3/<system>/index.ts
 * with a GameModule as its default export — and uses every seam the kernel opens: a system with the three
 * per-frame hooks and a budget, a save slice with a migration, an interactable source, a developer tab, and
 * events heard and emitted. It is written against the kernel's interfaces alone: of the game it imports types
 * only, so that it runs in Node with a stand-in for the game.
 *
 * What it plays at: berry bushes along a line. A bush that bears is a thing under the mark that E picks (a
 * thorny one wants E held); a picked bush bears again the next day; how many berries have been picked and
 * which bushes are bare are in the save.
 */
import type { SaveSlice } from '../../../../src/core/kernel/slices';
import type { System } from '../../../../src/core/kernel/systems';
import { hash2 } from '../../../../src/core/math/rng';
import type { Text } from '../../../../src/core/modcar/types';
import type { GarageDevice } from '../../../../src/game/modcar/garageStub';
import type { GameContext } from '../../../../src/game/modcar/kernel/context';
import type { DevTab } from '../../../../src/game/modcar/kernel/devTabs';
import type { InteractSource } from '../../../../src/game/modcar/kernel/interact';
import type { GameModule } from '../../../../src/game/modcar/kernel/modules';

// (the module's own event, added to the open list next to the code that emits it)
declare module '../../../../src/core/kernel/events' {
  interface GameEvents {
    /** berries were picked off a bush */
    'example:picked': { readonly bush: number; readonly berries: number };
  }
}

/** the slice at version 1: the indices of the bare bushes, nothing else */
export type BerriesSavedV1 = number[];

/** the slice today (version 2): each bare bush with the day it was picked on, and the berries picked so far */
export interface BerriesSaved {
  bare: Record<string, number>;
  picked: number;
}

const PICK: Text = { zh: '摘浆果', en: 'Pick the berries' };
const PICK_THORNY: Text = { zh: '小心地摘浆果', en: 'Pick the berries, carefully' };

/** one bush: where it stands, whether it bears, and — being what the mark finds — a device E works */
class Bush implements GarageDevice {
  readonly id: string;
  readonly radius = 0.45;
  /** the day it was picked on; −1: it bears */
  bareSince = -1;
  /** how far a hold on it has got (a thorny one) */
  held = 0;
  readonly holdS?: number;

  constructor(
    private readonly owner: Berries,
    readonly index: number,
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly berries: number,
    readonly thorny: boolean,
  ) {
    this.id = `example:${index}`;
    if (thorny) this.holdS = 0.6;
  }

  get word(): Text {
    return this.thorny ? PICK_THORNY : PICK;
  }

  holding(p: number): void {
    this.held = p;
  }

  use(): void {
    this.held = 0;
    this.owner.pick(this);
  }
}

export class Berries implements System<GameContext>, InteractSource {
  readonly id = 'example';
  readonly budget = { cpuMs: 0.05 };
  readonly bushes: Bush[] = [];
  /** berries picked since the journey began */
  picked = 0;
  /** things eaten since the page opened (heard, not kept) */
  eaten = 0;
  /** where the player is (the seat's vehicle, else the walker), and the bush nearest to that within 30 m (−1: none) */
  readonly at = { x: 0, z: 0 };
  nearest = -1;
  /** the nearest bush in render space (the world less the floating origin): where its model would be drawn */
  readonly shown = { x: 0, y: 0, z: 0 };
  /** how often each hook ran, and the frame's seconds they were handed */
  readonly ran = { init: 0, pre: 0, step: 0, late: 0, dispose: 0, seconds: 0 };
  /** what the game said of itself at the start: 'new' or 'restored' ('' before either) */
  began: '' | 'new' | 'restored' = '';
  private ctx: GameContext | null = null;

  // ---------------------------------------------------------------- the system

  /** the bushes laid out from the world's seed: the same seed, the same bushes */
  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.ran.init++;
    this.bushes.length = 0;
    const seed = ctx.params.seed;
    for (let i = 0; i < 24; i++) {
      const r = hash2(i, 7, seed);
      const x = 20 + i * 12 + ((r & 0xff) / 255) * 4;
      const z = (((r >>> 8) & 0xff) / 255 - 0.5) * 16;
      this.bushes.push(new Bush(this, i, x, 0.8, z, 3 + ((r >>> 16) % 5), ((r >>> 24) & 3) === 0));
    }
  }

  /** before the player is stepped: where one is now */
  preStep(_dt: number, ctx: GameContext): void {
    this.ran.pre++;
    const v = ctx.seated;
    const w = ctx.player.walker;
    this.at.x = v ? v.sim.px : w.x;
    this.at.z = v ? v.sim.pz : w.z;
  }

  /** after everything has moved: the bush nearest to one */
  step(dt: number, _ctx: GameContext): void {
    this.ran.step++;
    this.ran.seconds += dt;
    let best = -1;
    let bd = 30 * 30;
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i];
      const d = (b.x - this.at.x) * (b.x - this.at.x) + (b.z - this.at.z) * (b.z - this.at.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    this.nearest = best;
  }

  /** with the floating origin final: where the nearest bush is drawn */
  lateUpdate(_dt: number, ctx: GameContext): void {
    this.ran.late++;
    const b = this.nearest >= 0 ? this.bushes[this.nearest] : null;
    if (!b) return;
    const o = ctx.core.origin;
    this.shown.x = b.x - o.x;
    this.shown.y = b.y - o.y;
    this.shown.z = b.z - o.z;
  }

  dispose(): void {
    this.ran.dispose++;
    this.ctx = null;
  }

  telemetry(): Record<string, unknown> {
    return { bushes: this.bushes.length, bare: this.bare().length, picked: this.picked, nearest: this.nearest };
  }

  /** for test scripts (SystemRegistry.harness) */
  readonly harness = {
    bare: (): number[] => this.bare(),
    pick: (index: number): boolean => {
      const b = this.bushes[index];
      if (!b || b.bareSince >= 0) return false;
      b.use();
      return true;
    },
  };

  // ---------------------------------------------------------------- what it does

  bare(): number[] {
    return this.bushes.filter((b) => b.bareSince >= 0).map((b) => b.index);
  }

  /** E on a bush: its berries are picked, it is bare from today */
  pick(b: Bush): void {
    const ctx = this.ctx;
    if (!ctx || b.bareSince >= 0) return;
    b.bareSince = ctx.clock.day;
    this.picked += b.berries;
    ctx.ui.say(`摘了 ${b.berries} 颗浆果。`, 1.5);
    ctx.events.emit('example:picked', { bush: b.index, berries: b.berries });
  }

  /** a new day: the bushes picked on an earlier one bear again (all of them, when the developer asks) */
  regrow(day: number, all = false): number {
    let n = 0;
    for (const b of this.bushes) {
      if (b.bareSince >= 0 && (all || b.bareSince < day)) {
        b.bareSince = -1;
        n++;
      }
    }
    return n;
  }

  // ---------------------------------------------------------------- the interactable source

  /** the bushes that bear within r of (x, z): the ones the mark may find (the bushes themselves: nothing is made) */
  near(x: number, z: number, r: number, out: GarageDevice[]): void {
    for (let i = 0; i < this.bushes.length; i++) {
      const b = this.bushes[i];
      if (b.bareSince < 0 && Math.abs(b.x - x) <= r && Math.abs(b.z - z) <= r && (b.x - x) * (b.x - x) + (b.z - z) * (b.z - z) <= r * r) out.push(b);
    }
  }

  // ---------------------------------------------------------------- the save slice

  readonly slice: SaveSlice<BerriesSaved> = {
    id: 'example',
    version: 2,
    snapshot: () => {
      const bare: Record<string, number> = {};
      for (const b of this.bushes) if (b.bareSince >= 0) bare[b.index] = b.bareSince;
      return this.picked > 0 || Object.keys(bare).length ? { bare, picked: this.picked } : undefined;
    },
    restore: (data) => {
      for (const b of this.bushes) b.bareSince = data.bare[b.index] ?? -1;
      this.picked = data.picked;
    },
    // (version 1 knew neither the day a bush was picked on nor the count: bare since the first day, three berries a bush)
    migrate: (data, from) => {
      if (from !== 1 || !Array.isArray(data)) throw new Error(`berries: no way from version ${from}`);
      const list = data as BerriesSavedV1;
      return { bare: Object.fromEntries(list.map((i) => [i, 0])), picked: list.length * 3 };
    },
    clear: () => {
      for (const b of this.bushes) b.bareSince = -1;
      this.picked = 0;
    },
  };

  // ---------------------------------------------------------------- the developer's tab

  readonly tab: DevTab = {
    id: 'example',
    title: '浆果',
    order: 10,
    sub: '示例系统：路边的浆果丛',
    build: (pane) => {
      pane.heading('现在的情况');
      this.tabBox = pane.box();
      pane.heading('动手');
      const say = pane.message();
      pane.buttons(
        [
          { label: '全部重新长出', tip: '所有摘过的浆果丛马上重新结果。', go: true, click: () => say(`${this.regrow(0, true)} 丛重新结果了。`) },
          { label: '摘最近的一丛', click: () => say(this.nearest >= 0 && this.harness.pick(this.nearest) ? '摘了。' : '附近没有结果的浆果丛。', this.nearest < 0) },
        ],
        2,
      );
      pane.note('浆果丛按世界种子排在路边；摘过的第二天重新结果。');
      this.tab.tick?.();
    },
    tick: () => {
      if (this.tabBox) this.tabBox.textContent = `${this.bushes.length} 丛，其中 ${this.bare().length} 丛摘过了 · 一共摘了 ${this.picked} 颗`;
    },
  };

  private tabBox: { textContent: string | null } | null = null;

  // ---------------------------------------------------------------- the events it hears

  /** when the game is constructed: before the vehicles and the things lying about are there */
  setup(ctx: GameContext): void {
    ctx.events.on('clock:day', (e) => this.regrow(e.day));
    ctx.events.on('body:ate', () => void this.eaten++);
    ctx.events.on('game:new', () => void (this.began = 'new'));
    ctx.events.on('game:restored', () => void (this.began = 'restored'));
  }
}

/** a module of its own each time it is asked for (the tests each play a game of their own) */
export function exampleModule(): GameModule & { readonly berries: Berries } {
  const berries = new Berries();
  return { id: 'example', berries, systems: [berries], slices: [berries.slice], interact: [berries], devTabs: [berries.tab], setup: (ctx) => berries.setup(ctx) };
}

export default exampleModule();
