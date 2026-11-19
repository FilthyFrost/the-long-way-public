/**
 * A game for the tests of the cooking module (harness/sim/v3_cooking_module*.test.ts): the stand-in game of
 * fakeGame.ts with the cooking and the progress modules in it, the real player (src/game/modcar/player.ts) on
 * level ground or on a world's land, and plain stand-ins for the things lying about and the words on screen —
 * so that E at a station goes the whole way the game takes it (the mark finds the station through the
 * kernel's interactable sources, the modal opens, the panel's keys go through the modal), a portion is taken
 * out of the hands by the player's own takeOne, a dish goes into them by ModPlayer.receive, and eating it is
 * the game's body:ate.
 */
import { newItem, type ItemInstance } from '../../../src/core/modcar/items';
import { stepVitals, type VitalsInput } from '../../../src/core/modcar/vitals';
import type { World } from '../../../src/core/world/terrain';
import type { GameContext } from '../../../src/game/modcar/kernel/context';
import { ModPlayer, type PlayerHost } from '../../../src/game/modcar/player';
import cookingModule, { cooking } from '../../../src/game/modcar/v3/cooking/index';
// (the forage kinds are items of the forage module's: loaded for what it registers, not installed)
import '../../../src/game/modcar/v3/forage/index';
import progressModule from '../../../src/game/modcar/v3/progress/index';
import { FakeGame, type FakeSave } from './fakeGame';

export interface CookRigOptions {
  world?: World | null;
  /** where the journey began: the workshop (its kitchen corner is there) or the road */
  start?: 'garage' | 'road';
  save?: FakeSave | null;
  hour?: number;
  /** hotbar slots beyond the two hands */
  pack?: number;
  at?: { x: number; z: number };
}

export async function cookRig(o: CookRigOptions = {}) {
  const world = o.world ?? null;
  const game = new FakeGame([cookingModule, progressModule], o.save ?? null, { seed: 9, hour: o.hour ?? 10 });
  const lying: { item: ItemInstance | null; x: number; y: number; z: number; yaw: number; riding?: unknown }[] = [];
  const loose = {
    list: lying,
    pick: () => null,
    highlight: () => {},
    remove: (l: unknown) => {
      const i = lying.indexOf(l as never);
      if (i >= 0) lying.splice(i, 1);
    },
    touch: () => {},
    addItem: (item: ItemInstance, x: number, y: number, z: number, yaw = 0) => {
      const l = { item, x, y, z, yaw };
      lying.push(l);
      return l;
    },
    drop: () => {},
  };
  const ui = {
    lang: 'zh' as const,
    root: null,
    say: (text: string) => void game.said.push(text),
    prompt: () => {},
    items: { showActions: () => {}, showCards: () => {}, showKeys: () => {}, showTransfer: () => {}, showHotbar: () => {}, showDone: () => {} },
  };
  const host = {
    vehicles: [],
    devices: [],
    tanks: [],
    origin: { x: 0, y: 0, z: 0 },
    interact: game.interact,
    loose,
    ui,
    cargo: { showGhost: () => {}, aim: () => null },
    changed: () => {},
    enter: () => {},
    sound: () => {},
    iconOf: () => null,
    cargoChanged: () => {},
    consume: (item: ItemInstance) => void game.events.emit('body:ate', { item }),
    drank: () => {},
    camera: null,
    grimeCast: () => null,
    paintCast: () => null,
    listOpen: false,
  } as unknown as PlayerHost;
  const player = new ModPlayer(world ?? { shape: (_x, _z, tp) => void ((tp.h = tp.bed = 0), (tp.wl = -Infinity), (tp.bridge = 0)) }, host);
  for (let i = 0; i < (o.pack ?? 6); i++) player.slots.push(null);
  const at = o.at ?? { x: 0, z: 0 };
  player.walker.place(at.x, at.z, 0);

  const ctx = game.ctx as { -readonly [K in keyof GameContext]: GameContext[K] };
  ctx.world = world;
  ctx.player = player;
  ctx.loose = loose as unknown as GameContext['loose'];
  ctx.ui = ui as unknown as GameContext['ui'];
  ctx.params = { seed: 9, shot: false, keep: true, world: world ? world.rules.version : 2, start: o.start ?? 'garage' } as unknown as GameContext['params'];

  const heard: string[] = [];
  game.events.on('cooking:plated', (e) => heard.push(`plated ${e.recipe ?? e.name} x${e.servings} ${e.stars}*`));
  game.events.on('cooking:buff', (e) => heard.push(`buff ${e.buff} ${e.seconds}s`));
  game.events.on('compendium:met', (e) => heard.push(`met ${e.domain}/${e.id}`));
  game.events.on('compendium:learned', (e) => heard.push(`learned ${e.domain}/${e.id} by ${e.by}`));
  await game.start();

  const input: VitalsInput = { dt: 1 / 60, sprinting: false, jumped: false, ambientC: 18, warmth: 9, rain: false, peeing: false, mods: game.ctx.bodyMods };
  return {
    game,
    ctx: game.ctx,
    player,
    lying,
    heard,
    cooking,
    /** frames of the game, each with the body stepped after the systems' preStep as the game steps it */
    frames(n = 1, dt = 1 / 60): void {
      for (let i = 0; i < n; i++) {
        game.frame(dt);
        input.dt = dt;
        stepVitals(game.ctx.body, input);
      }
    },
    /** a stack into the hands (as the developer's tab gives it) */
    give(id: string, n = 1, q = 2): ItemInstance {
      const it = newItem(id, { ...(n > 1 ? { n } : {}), q, t0: game.clock.worldSeconds });
      player.receive({ kind: 'item', item: it });
      return it;
    },
    /** what is in the hotbar */
    held: (id: string): ItemInstance | null => {
      for (const h of player.slots) if (h?.kind === 'item' && h.item.item === id) return h.item;
      return null;
    },
    /** stand before a point, facing it, and press E on what the mark is on: true when something was used */
    pressAt(x: number, y: number, z: number): boolean {
      player.walker.place(x - 1.1, z, 0);
      // (the eye a little over the point, looking down at it)
      const eye = player.walker.eye();
      const yaw = Math.atan2(z - player.walker.z, x - player.walker.x);
      const pitch = Math.atan2(y - eye.y, Math.hypot(x - player.walker.x, z - player.walker.z));
      const keys = { run: false, jump: false, drop: false, take: false, forward: 0, right: 0 };
      player.update(1 / 60, yaw, pitch, keys);
      const target = String(player.telemetry().target);
      player.press();
      player.update(1 / 60, yaw, pitch, keys);
      player.release();
      player.update(1 / 60, yaw, pitch, keys);
      return target.startsWith('device:cooking:');
    },
    /** a key into the panel as the keyboard's goes (through the modal) */
    key: (code: string): boolean => game.modal.key(code),
    panel: () => cooking.harness.panel(),
  };
}
