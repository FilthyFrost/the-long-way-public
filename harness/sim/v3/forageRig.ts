/**
 * A game for the tests of the forage module (harness/sim/v3_forage_module*.test.ts): the stand-in game of
 * fakeGame.ts with the forage and the progress modules in it, and — where the stand-in has only a walker —
 * the real player (src/game/modcar/player.ts) on the real land of a world, so that a pick goes the whole way
 * the game takes it: the mark finds the point through the kernel's interactable sources, E works the device,
 * the hands take the thing by ModPlayer.receive. The things lying about, the words on screen and the weather
 * are plain stand-ins the tests read and set.
 */
import type * as THREE from 'three';
import type { ItemInstance } from '../../../src/core/modcar/items';
import { BIOMES } from '../../../src/core/world/biomes';
import { SpineSample } from '../../../src/core/world/spine';
import { World } from '../../../src/core/world/terrain';
import type { Action, SlotView } from '../../../src/game/modcar/hudItems';
import type { ItemCard } from '../../../src/game/modcar/itemInfo';
import type { GameContext } from '../../../src/game/modcar/kernel/context';
import { ModPlayer, type PlayerHost } from '../../../src/game/modcar/player';
import forageModule, { forage } from '../../../src/game/modcar/v3/forage/index';
import type { Forage } from '../../../src/game/modcar/v3/forage/system';
import progressModule from '../../../src/game/modcar/v3/progress/index';
import { FakeGame, type FakeSave } from './fakeGame';

/** a world of version 2 that begins in forest (the tests share it: what grows where is the world's, not the game's) */
export const SEED = 9;
export const WORLD = new World(SEED, { worldVersion: 2, startBiome: 'forest', chapterScale: 6 });
/** the same seed's world of version 1: no flora field, so no foraging */
export const V1_WORLD = new World(SEED, { worldVersion: 1, startBiome: 'forest', chapterScale: 6 });
export const FOREST = BIOMES.find((b) => b.id === 'forest')!;

/** a point as the system lists it (Forage.shownNow) */
export type Shown = ReturnType<Forage['shownNow']>[number];

/** a place in the forest, 40 m to the left of the road 4 km along it: wood, with things of fifteen kinds about */
export function forestSpot(world: World = WORLD, s = 4000, off = 40): { x: number; z: number } {
  const p = new SpineSample();
  world.spine.at(s, p);
  return { x: p.x - Math.sin(p.phi) * off, z: p.z + Math.cos(p.phi) * off };
}

/** whole game days pass (the hour hand goes round: midnight is crossed and said) */
export function passDays(game: FakeGame, n: number): void {
  const h = game.sky.hour;
  for (let i = 0; i < n; i++) {
    game.setHour((h + 12) % 24);
    game.setHour(h);
  }
}

export interface RigOptions {
  /** the world (default: the shared forest of version 2); null: none yet */
  world?: World | null;
  /** what the address asked for: the world's version (default: the world's own), where the game starts (default: on the road, where no kit is given) */
  version?: 1 | 2;
  start?: 'garage' | 'road';
  save?: FakeSave | null;
  hour?: number;
  /** more hotbar slots than the two hands (as a backpack gives) */
  pack?: number;
  /** one sits in a vehicle that stands still */
  seated?: boolean;
  /** where one stands (default: the forest spot) */
  at?: { x: number; z: number };
  /** the game draws: the renderer's stand-in has a scene, so the system makes its real view (three runs in Node as far as building a batch goes) */
  scene?: THREE.Scene;
}

export async function forageRig(o: RigOptions = {}) {
  const world = o.world === undefined ? WORLD : o.world;
  const game = new FakeGame([forageModule, progressModule], o.save ?? null, { seed: SEED, hour: o.hour ?? 10 });
  const lying: { item: ItemInstance; x: number; y: number; z: number; yaw: number }[] = [];
  const seen = { acts: [] as Action[], keys: [] as Action[], held: null as ItemCard | null, aim: null as ItemCard | null, slots: [] as SlotView[] };
  const weather = { rain: 0 };
  const forcing = { force: null as string | null };
  const loose = {
    list: lying,
    pick: () => null,
    highlight: () => {},
    remove: () => {},
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
      showDone: () => {},
    },
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
  // (the player walks the world's own land; with no world, level ground)
  const player = new ModPlayer(world ?? { shape: (_x, _z, tp) => void ((tp.h = tp.bed = 0), (tp.wl = -Infinity), (tp.bridge = 0)) }, host);
  for (let i = 0; i < (o.pack ?? 0); i++) player.slots.push(null);
  const at = o.at ?? (world ? forestSpot(world) : { x: 0, z: 0 });
  player.walker.place(at.x, at.z, 0);

  // the game half of the context, as far as the forage module looks at it
  const ctx = game.ctx as { -readonly [K in keyof GameContext]: GameContext[K] };
  ctx.world = world;
  ctx.player = player;
  ctx.loose = loose as unknown as GameContext['loose'];
  ctx.env = { sky: game.sky, state: weather, weather: forcing } as unknown as GameContext['env'];
  ctx.ui = ui as unknown as GameContext['ui'];
  ctx.params = { seed: SEED, shot: false, keep: true, world: o.version ?? (world ? world.rules.version : 2), start: o.start ?? 'road' } as unknown as GameContext['params'];
  if (o.seated) game.seated = { sim: { kmh: 0, px: at.x, py: 0, pz: at.z } } as unknown as GameContext['seated'];
  if (o.scene) ctx.core = { origin: game.origin, scene: o.scene } as unknown as GameContext['core'];

  const heard: string[] = [];
  game.events.on('forage:picked', (e) => heard.push(`picked ${e.kind} x${e.n} q${e.q} key ${e.key}`));
  game.events.on('compendium:met', (e) => heard.push(`met ${e.domain}/${e.id}`));
  game.events.on('skill:xp', (e) => heard.push(`xp ${e.skill} +${e.gained}`));
  await game.start();

  const keys = { run: false, jump: false, drop: false, take: false, forward: 0, right: 0 };
  const look = { yaw: 0, pitch: 0 };
  /** a frame of the player on foot, looking where it last looked */
  const step = (): void => player.update(1 / 60, look.yaw, look.pitch, keys);
  const frames = (n = 1, dt = 1 / 60): void => {
    for (let i = 0; i < n; i++) game.frame(dt);
  };
  return {
    game,
    ctx: game.ctx,
    player,
    lying,
    seen,
    heard,
    weather,
    /** the weather the developer's tab forced (null: the schedule's) */
    forced: (): string | null => forcing.force,
    frames,
    /** frames enough for the tiles about to be worked out and a look to be taken */
    settle: (n = 170): void => frames(n),
    shown: (most?: number): Shown[] => forage.shownNow(most),
    /** stand a step short of a point and look at where the mark aims at it; what the mark is on then */
    aim: (pt: Shown, back = 1.0): string => {
      const w = player.walker;
      w.place(pt.x - back, pt.z, 0);
      const eye = w.eye();
      look.yaw = Math.atan2(pt.z - w.z, pt.x - w.x);
      look.pitch = Math.atan2(pt.aimY - eye.y, Math.hypot(pt.x - w.x, pt.z - w.z));
      step();
      return String(player.telemetry().target);
    },
    /** E, pressed and let go */
    pressE: (): void => {
      player.press();
      step();
      player.release();
      step();
    },
    /** walk up to a point and pick it with the mark and E */
    pick(pt: Shown): void {
      const on = this.aim(pt);
      if (on !== `device:forage:${pt.key}`) throw new Error(`the mark is on '${on}', not on the point ${pt.kind} ${pt.key}`);
      this.pressE();
    },
    /** what is in a slot of the hotbar (an item, or null) */
    item: (i: number): ItemInstance | null => {
      const h = player.slots[i];
      return h?.kind === 'item' ? h.item : null;
    },
    /** the first thing of a kind in the hotbar */
    held: (id: string): ItemInstance | null => {
      for (const h of player.slots) if (h?.kind === 'item' && h.item.item === id) return h.item;
      return null;
    },
  };
}
