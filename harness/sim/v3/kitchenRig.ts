/**
 * A game for the tests of the kitchen module (harness/sim/k3_kitchen_module.test.ts): the stand-in game of
 * fakeGame.ts with the kitchen module in it, the real player (src/game/modcar/player.ts) on level ground, and things
 * lying about as plain objects that have what the kitchen and the player's pick read of them — where they are, a
 * frame (a three.js group: its matrix is what a stove's three parts are found in), a sphere to pick them by. So a
 * meal goes the whole way the game takes it: the mark finds the stove's knob through the kernel's interactable
 * sources, E works the device with what is in the hands, the hands take the dish by ModPlayer.receive.
 *
 * Nothing is drawn (the renderer's stand-in has no scene: the system makes no view and no recipe-book page).
 */
import * as THREE from 'three';
import type { ItemInstance } from '../../../src/core/modcar/items';
import type { GarageDevice } from '../../../src/game/modcar/garageStub';
import type { Action, SlotView } from '../../../src/game/modcar/hudItems';
import type { ItemCard } from '../../../src/game/modcar/itemInfo';
import type { GameContext } from '../../../src/game/modcar/kernel/context';
import type { Loose } from '../../../src/game/modcar/loose';
import { ModPlayer, type PlayerHost } from '../../../src/game/modcar/player';
import kitchenModule, { kitchen } from '../../../src/game/modcar/v3/kitchen/index';
import type { Unit } from '../../../src/game/modcar/v3/kitchen/system';
import { FakeGame, type FakeSave } from './fakeGame';

/** a stove's three parts, a point of each in the stove's own frame (m) */
export const STOVE_POINT = { knob: [0.145, 0.045, -0.03], bay: [0.03, 0.06, -0.135], top: [0, 0.16, 0.07] } as const;

export async function kitchenRig(o: { save?: FakeSave | null; pack?: number } = {}) {
  const game = new FakeGame([kitchenModule], o.save ?? null, { hour: 10 });
  const lying: Loose[] = [];
  let made = 0;
  const place = (l: Loose): void => {
    l.obj.position.set(l.x, l.y, l.z);
    l.obj.rotation.set(0, -l.yaw, 0);
    l.obj.updateMatrixWorld(true);
  };
  const ray = new THREE.Ray();
  const sphere = new THREE.Sphere();
  const hit = new THREE.Vector3();
  const loose = {
    list: lying,
    rev: 0,
    root: null,
    // (the game's own: the nearest thing whose sphere the line of sight meets, those a system works left out)
    pick(eye: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number, filter?: (l: Loose) => boolean) {
      let best: Loose | null = null;
      let bd = maxDist;
      ray.origin.set(eye.x, eye.y, eye.z);
      ray.direction.set(dir.x, dir.y, dir.z).normalize();
      for (const l of lying) {
        if (l.device || l.shut || (filter && !filter(l))) continue;
        sphere.center.set(l.x, l.y + l.mid, l.z);
        sphere.radius = l.radius * 0.85;
        const p = ray.intersectSphere(sphere, hit);
        if (!p) continue;
        const d = p.distanceTo(ray.origin);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      return best ? { loose: best, dist: bd } : null;
    },
    highlight: () => {},
    remove(l: Loose) {
      const i = lying.indexOf(l);
      if (i >= 0) lying.splice(i, 1);
      loose.rev++;
    },
    touch(l?: Loose) {
      if (l) l.touched = true;
    },
    // (a thing made another kind where it lies: nothing is drawn here)
    retype: () => {},
    addItem(item: ItemInstance, x: number, y: number, z: number, yaw = 0): Loose {
      const l = { uid: `l${++made}`, part: null, tool: null, item, x, y, z, yaw, vy: 0, resting: true, obj: new THREE.Group(), radius: 0.2, mid: 0.07 } as Loose;
      place(l);
      lying.push(l);
      loose.rev++;
      return l;
    },
    // (level ground: a thing let go is on it at once)
    drop(l: Loose) {
      l.y = 0;
      place(l);
    },
    surfaceAt: () => 0,
    carriers: () => [],
  };
  const seen = { acts: [] as Action[], keys: [] as Action[], held: null as ItemCard | null, aim: null as ItemCard | null, slots: [] as SlotView[] };
  const ui = {
    lang: 'zh' as const,
    root: null,
    say: (text: string) => void game.said.push(text),
    prompt: () => {},
    items: {
      showActions: (a: Action[]) => void (seen.acts = a),
      showCards: (h: ItemCard | null, a: ItemCard | null) => {
        seen.held = h;
        seen.aim = a;
      },
      showKeys: (a: Action[]) => void (seen.keys = a),
      showTransfer: () => {},
      showHotbar: (s: SlotView[]) => void (seen.slots = s),
      // (a flash over the hotbar: said, as a toast is — docs/V3/plan/prompts.md §五)
      showDone: (text: string) => void game.said.push(text),
    },
  };
  const host = {
    vehicles: [],
    devices: [],
    tanks: [],
    origin: game.origin,
    interact: game.interact,
    loose,
    ui,
    cargo: { showGhost: () => {}, aim: () => null },
    changed: () => {},
    enter: () => {},
    sound: (name: string) => void game.sounds.push(name),
    iconOf: () => null,
    cargoChanged: () => {},
    consume: (item: ItemInstance) => void game.events.emit('body:ate', { item }),
    drank: () => {},
    camera: null,
    grimeCast: () => null,
    paintCast: () => null,
    listOpen: false,
  } as unknown as PlayerHost;
  const player = new ModPlayer({ shape: (_x, _z, tp) => void ((tp.h = tp.bed = 0), (tp.wl = -Infinity), (tp.bridge = 0)) }, host);
  for (let i = 0; i < (o.pack ?? 0); i++) player.slots.push(null);
  player.walker.place(0, 0, 0);

  const ctx = game.ctx as { -readonly [K in keyof GameContext]: GameContext[K] };
  ctx.player = player;
  ctx.loose = loose as unknown as GameContext['loose'];
  ctx.ui = ui as unknown as GameContext['ui'];
  await game.start();

  const keys = { run: false, jump: false, drop: false, take: false, forward: 0, right: 0 };
  const look = { yaw: 0, pitch: 0 };
  /** a frame of the player on foot, looking where it last looked, then one of the game */
  const step = (dt = 1 / 60): void => {
    player.update(dt, look.yaw, look.pitch, keys);
    game.frame(dt);
  };
  const frames = (n = 1, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) step(dt);
  };
  const rig = {
    game,
    ctx: game.ctx,
    player,
    lying,
    seen,
    kitchen,
    frames,
    /** seconds pass, in thirtieths */
    pass: (s: number): void => frames(Math.round(s * 30), 1 / 30),
    /** the unit a kind of cookware lying about is (the first of it) */
    unit: (item: string): Unit => {
      const u = kitchen.list.find((x) => x.item.item === item);
      if (!u) throw new Error(`no ${item} among the kitchen's things`);
      return u;
    },
    /** look at a point of the world from where one stands; what the mark is on then */
    lookAt: (x: number, y: number, z: number): string => {
      const eye = player.walker.eye();
      look.yaw = Math.atan2(z - eye.z, x - eye.x);
      look.pitch = Math.atan2(y - eye.y, Math.hypot(x - eye.x, z - eye.z));
      step();
      step();
      return String(player.telemetry().target);
    },
    /** look at a unit: a stove's part, or the thing's middle */
    aim(u: Unit, part: keyof typeof STOVE_POINT | 'all' = 'all'): string {
      const p = part === 'all' ? new THREE.Vector3(0, u.loose.mid, 0) : new THREE.Vector3(...STOVE_POINT[part]);
      u.loose.obj.localToWorld(p);
      return this.lookAt(p.x, p.y, p.z);
    },
    /** the device the mark is on (null: on none) */
    marked: (): GarageDevice | null => {
      const t = player.target;
      return t?.kind === 'device' ? t.device : null;
    },
    /** the words the mark shows now: what E would do with what is in the hands, or the thing's own */
    word: (): string => {
      const t = player.target;
      if (t?.kind !== 'device') return '';
      const take = player.held && t.device.take ? t.device.take(player.held) : null;
      return (take ? take.word : t.device.word).zh;
    },
    /** the left button pressed and let go (a press that waits for the button to come up fires on the second frame) */
    pressE: (): void => {
      player.press();
      step();
      player.release();
      step();
    },
    /** the left button held so long (s), then let go: a promoted grab or hold */
    holdL: (s = 1.0): void => {
      player.press();
      frames(Math.round(s * 60));
      player.release();
      step();
    },
    /** E held so long (s), then let go: secondary grab on a functional device (lift vessel off burner, pick up appliance) */
    holdE: (s = 0.65): void => {
      keys.take = true;
      frames(Math.round(s * 60));
      keys.take = false;
      step();
    },
    /** the wheel turned with the mark where it is: a device's second thing (a flame up or down) */
    wheel: (d = 1): void => {
      player.wheel(d);
      step();
    },
    /** a thing into the hands */
    give: (item: ItemInstance): number => player.receive({ kind: 'item', item }),
    /** the thing in the hand, or in a slot */
    held: (): ItemInstance | null => (player.held?.kind === 'item' ? player.held.item : null),
    item: (i: number): ItemInstance | null => {
      const h = player.slots[i];
      return h?.kind === 'item' ? h.item : null;
    },
    /** the hands emptied (the tests' own shortcut) */
    empty: (): void => {
      for (let i = 0; i < player.slots.length; i++) player.slots[i] = null;
      player.sel = 0;
    },
    /** a button of the developer's tab pressed; what the tab said */
    button: (label: string): string => {
      const tab = game.openTab('kitchen');
      const b = tab?.buttons.find((x) => x.label === label);
      if (!tab || !b) throw new Error(`no button '${label}' on the kitchen's tab`);
      b.click({} as HTMLButtonElement);
      return tab.message;
    },
  };
  return rig;
}
