/**
 * The forage system (node W3, docs/V3/nodes/W3-forage.md): what the player finds growing, and the pick.
 *
 * Forage points are computed, never stored: they are the bearing plants of the world's flora field
 * (src/core/v3/forage/field.ts over world.flora), which a world of version 2 has and a world of version 1
 * does not — so there is no foraging in a version 1 world at all. On foot, or in a seat at no more than a
 * walk, the system looks about: after every 6 m moved it asks the field for the bearing plants within 70 m,
 * and three times a second it goes through them and keeps those that show now — not picked and still
 * regrowing, and not out of season (the hour, the hours since rain, the tide: rules.ts forageShows). The
 * points that show are handed to the view (what is drawn of them) and are what the mark finds: within reach
 * each is a device E works at once.
 *
 * A pick (pickResult: the tools in the hotbar and the skill are bonuses) makes the item, hands it to the
 * hands (ModPlayer.receive: onto a stack, into a basket, into a free slot), puts what they do not take down
 * by the feet, remembers the point until it bears again, and says so: the event forage:picked, the
 * compendium and the skill (progress/api.ts), a short sound, one line.
 *
 * What the save keeps (the slice "forage"): the picked points with the day each bears again, the world's
 * second it last rained, and whether the starter kit was given. Nothing else: everything else is the world's.
 *
 * Nothing of the system's own in the three hooks or in `near` allocates (harness/sim/v3_forage_module_cost.test.ts).
 * The field's question does: asked as seldom as this it leaves about 80 bytes for each point it fills, 8 KB
 * for a hundred points, and the land's answer about the water over a plant half a kilobyte. That is why the
 * field is asked once per 6 m walked and not three times a second, why the water's level is kept for each
 * plant of the water, and why the tiles of plants are asked for one at a time beforehand, a tile being a
 * third of a millisecond and more to work out the first time.
 */
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { System } from '../../../../core/kernel/systems';
import { newItem, stackMax } from '../../../../core/modcar/items';
import { ForageField, ForagePoint } from '../../../../core/v3/forage/field';
import { FORAGE_KINDS } from '../../../../core/v3/forage/kinds';
import { FIRST_PICK_XP, forageShows, nextLowTide, pickResult, tideAt, type PickBonus, type PickResult } from '../../../../core/v3/forage/rules';
import { ECO_TILE } from '../../../../core/world/ecotope';
import type { FloraField, FloraLayer } from '../../../../core/world/flora';
import { PLANTS } from '../../../../core/world/plants';
import { TerrainPoint, type World } from '../../../../core/world/terrain';
import type { GarageDevice } from '../../garageStub';
import type { ItemCard } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { announce, atWalkingPace, gainXp, learn, learnMany, meet, progress, progressRev } from '../progress/api';
import { BASKET, FORAGE_DOMAIN, FORAGE_SKILL_ID, HINT_GLOW_M, HINT_M, KNIFE, KNOWN_FROM, PAGE_CAT, PERK_DOUBLE, PERK_GLOW, PERK_STAR, PERK_TWINS, SICKLE, TROWEL, WORDS } from './content';
import { KIND_INDEX, KNOWN, kindsOfCat, kindsTaughtAt, MISTAKEN, nameNow, pointCard, pointWord, twinKinds, veilOf } from './knowledge';
import { PickedTable } from './picked';
import { AIM_OVER_WATER } from './view/view';
import type { Text } from '../../../../core/modcar/types';
import { FORAGE_CATS } from '../../../../core/v3/forage/types';

declare module '../../../../core/kernel/events' {
  interface GameEvents {
    /** a plant was picked: its kind, how many portions of what quality, and the point's key */
    'forage:picked': { readonly kind: string; readonly n: number; readonly q: number; readonly key: number };
  }
}

/** what is drawn of the points that show (view/view.ts in the game; nothing in Node, or a test's own) */
export interface ForageShow {
  /**
   * The points that show now: the first `n` of `points` (the objects are the system's: read them during the
   * call), the height the mark aims at each, and where one stands.
   */
  show(points: readonly ForagePoint[], n: number, aimY: Float32Array, at: { readonly x: number; readonly y: number; readonly z: number }): void;
  /** one of them was picked: its plant shrinks away, its glint goes */
  picked(point: ForagePoint): void;
  /** once a frame, the floating origin final: where one stands, how far off a point glints, every point marked */
  update(dt: number, ctx: GameContext, x: number, y: number, z: number, hintM: number, mark: boolean): void;
  /** nothing shows (one drives, the world has no flora) */
  clear(): void;
  dispose(): void;
}

/** how far the system looks (m), how often it goes through what it found (s), how far one moves before it asks the field again (m) */
export const LOOK_M = 70;
const LOOK_S = 1 / 3;
const LOOK_MOVE_M = 6;
/** with the developer's switch on, every point this near is marked (and looked for) */
export const MARK_M = 150;
/** the environment's rain (0 … 1) from which it counts as raining */
const RAINING = 0.12;
/** hours since rain when it has never rained */
const NEVER = 1e6;
/** a tile of plants is asked for at most every so many steps while the tiles about are being worked out */
const WARM_EVERY = 4;
/** the hotbar is looked at for a page of the compendium this often (s) */
const PAGE_S = 0.5;
/** how near the robot stands to a point before it picks (m), and how fast it walks (m/s: the walker's own pace) */
const ROBOT_REACH = 1.5;
const ROBOT_SPEED = 1.9;

/** the save's slice */
export interface ForageSaved {
  /** key, day, key, day …: each picked point with the game day from which it bears again */
  p: number[];
  /** the world's second it last rained (absent: it has not) */
  rain?: number;
  /** the starter kit was given */
  kit?: true;
}

/** a point within reach, as the mark finds it: a device E picks at once */
class PointDevice implements GarageDevice {
  id = 'forage:0';
  x = 0;
  y = 0;
  z = 0;
  radius = 0.3;
  /** the point it stands for now (null: free) and that point's key */
  point: ForagePoint | null = null;
  key = -1;
  /** it was handed out in the question being answered */
  used = false;

  constructor(private readonly owner: Forage) {}

  get word(): Text {
    return this.point ? pointWord(this.point.kind) : WORDS.pick;
  }

  get card(): ItemCard | undefined {
    return this.point ? pointCard(this.point.kind) : undefined;
  }

  use(): void {
    if (this.point) this.owner.pick(this.point);
  }
}

export class Forage implements System<GameContext>, InteractSource {
  readonly id = 'forage';
  readonly budget = { cpuMs: 0.2 };

  private ctx: GameContext | null = null;
  /** the world the field is of (a field is made anew when the world is another) */
  private world: World | null = null;
  private field: ForageField | null = null;
  /** what is drawn: the game's view, a test's own, or nothing */
  view: ForageShow | null = null;
  /** makes the view when the system is set up in a game that draws (index.ts gives it; absent: nothing is drawn) */
  makeView: ((ctx: GameContext) => ForageShow | null) | null = null;

  // ---- what was found
  /** the bearing plants within the look-out's radius of where the field was last asked, and how many */
  private readonly found: ForagePoint[] = [];
  private nFound = 0;
  /** those of them that show now, and for each the height the mark aims at and how big it is to look at */
  private readonly shown: ForagePoint[] = [];
  private nShown = 0;
  private aimY = new Float32Array(64);
  private aimR = new Float32Array(64);
  /** where the field was last asked, with which radius (−1: not yet) */
  private askedX = 0;
  private askedZ = 0;
  private askedR = -1;
  private lookT = 0;
  /** tiles of plants still to be asked for before the field is (layer, tx, tz each), and the range that is worked out */
  private readonly warmQueue = new Int32Array(3 * 3 * 16);
  private warmLeft = 0;
  private warmStep = 0;
  private wx0 = 1;
  private wx1 = 0;
  private wz0 = 1;
  private wz1 = 0;
  private warmWorld: World | null = null;
  private readonly tp = new TerrainPoint();
  /** the water's surface over each plant of the water met so far, by the point's key */
  private readonly levels = new LevelCache();

  // ---- what is remembered
  readonly picked = new PickedTable();
  /** the world's second it last rained (−1: it has not) */
  private rainS = -1;
  /** the starter kit was given; and it is due: 1 a game began, 2 a game was taken up without it (0: not due) */
  private kit = false;
  private kitDue = 0;

  // ---- the conditions points show under, the dice of a pick: one object each, written into
  private readonly cond = { hour: 12, sinceRainH: NEVER, tide: 0 };
  private readonly bonus = { knife: false, trowel: false, sickle: false, level: 1, double: false, star: false };
  private readonly result: PickResult = { n: 0, q: 0, xp: 0 };
  /** where one stands (the walker, or the vehicle one sits in) */
  private readonly here = { x: 0, y: 0, z: 0 };
  private pageT = 0;
  /** the Progress's count of changes at which the pages in the hands were last read */
  private pagesAt = -1;
  /** the developer's switch: every point within MARK_M is marked */
  mark = false;

  // ---- the devices handed to the mark
  private readonly devices: PointDevice[] = [];

  // ---- the robot forager (for scripts)
  private readonly robot = { on: false, x0: 0, z0: 0, r: 60, seconds: 0, picked: 0, portions: 0, walked: 0, done: false, most: 0 };

  /** how many picks there were since the page opened (the telemetry's) */
  private picks = 0;

  // ---------------------------------------------------------------- the system

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.reset();
    this.view?.dispose();
    this.view = this.makeView ? this.makeView(ctx) : null;
  }

  /** as a game begins: nothing found, nothing remembered */
  private reset(): void {
    this.world = null;
    this.field = null;
    this.nFound = 0;
    this.nShown = 0;
    this.askedR = -1;
    this.lookT = 0;
    this.warmLeft = 0;
    this.warmWorld = null;
    this.levels.clear();
    this.picked.clear();
    this.rainS = -1;
    this.kit = false;
    this.kitDue = 0;
    this.mark = false;
    this.pageT = 0;
    this.pagesAt = -1;
    this.robot.on = false;
    this.robot.done = false;
    for (const d of this.devices) {
      d.point = null;
      d.key = -1;
    }
  }

  /** before the player is stepped: the robot, when a script has set it going, walks */
  preStep(dt: number, ctx: GameContext): void {
    if (this.robot.on) this.robotStep(dt, ctx);
  }

  step(dt: number, ctx: GameContext): void {
    if (this.kitDue !== 0 && !ctx.seated) this.giveKit(ctx);
    this.pageT += dt;
    if (this.pageT >= PAGE_S) {
      this.pageT = 0;
      this.readPages(ctx);
    }
    const world = ctx.world;
    const flora = world ? world.flora : null;
    // (no flora: a world of version 1, or no world yet; driving: nothing is looked for, nothing shows)
    if (!world || !flora || !atWalkingPace(ctx)) {
      if (this.nShown > 0 || this.nFound > 0 || this.askedR >= 0) this.lookAway();
      return;
    }
    if (world !== this.world) {
      this.world = world;
      this.levels.clear();
      this.field = new ForageField(flora);
      this.askedR = -1;
      this.nFound = 0;
      this.nShown = 0;
    }
    const at = this.whereNow(ctx);
    const r = this.mark ? MARK_M : LOOK_M;
    const dx = at.x - this.askedX;
    const dz = at.z - this.askedZ;
    this.lookT += dt;
    if (this.askedR !== r || dx * dx + dz * dz >= LOOK_MOVE_M * LOOK_MOVE_M) {
      // the field is to be asked again: its tiles first, one at a time
      if (!this.warm(world, flora, at, r)) return;
      this.nFound = this.field!.near(at.x, at.z, r, this.found);
      this.askedX = at.x;
      this.askedZ = at.z;
      this.askedR = r;
      this.lookT = LOOK_S;
    }
    if (this.lookT >= LOOK_S) {
      this.lookT = 0;
      this.sift(ctx, world);
    }
  }

  /** with the floating origin final: whether it rains (this frame's weather), and what is drawn */
  lateUpdate(dt: number, ctx: GameContext): void {
    const weather = ctx.env.state as { rain: number } | undefined;
    if (weather && weather.rain > RAINING) this.rainS = ctx.clock.worldSeconds;
    const view = this.view;
    if (!view) return;
    const at = this.whereNow(ctx);
    view.update(dt, ctx, at.x, at.y, at.z, this.hintM(), this.mark);
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
    this.ctx = null;
    this.robot.on = false;
  }

  telemetry(): Record<string, unknown> {
    return { found: this.nFound, shown: this.nShown, picked: this.picked.size, picks: this.picks, kit: this.kit, sinceRainH: this.rainS < 0 ? null : this.sinceRainH(), mark: this.mark };
  }

  // ---------------------------------------------------------------- looking about

  /** where one stands: the walker's feet, or the vehicle one sits in */
  private whereNow(ctx: GameContext): { x: number; y: number; z: number } {
    const v = ctx.seated;
    const at = this.here;
    if (v) {
      at.x = v.sim.px;
      at.y = v.sim.py;
      at.z = v.sim.pz;
    } else {
      const w = ctx.player.walker;
      at.x = w.x;
      at.y = w.y;
      at.z = w.z;
    }
    return at;
  }

  /** how far off a point glints (m) */
  private hintM(): number {
    return progress.hasPerk(PERK_GLOW) ? HINT_GLOW_M : HINT_M;
  }

  private sinceRainH(): number {
    const ctx = this.ctx;
    return this.rainS < 0 || !ctx ? NEVER : Math.max(0, (ctx.clock.worldSeconds - this.rainS) / 3600);
  }

  /** nothing is looked for any more: nothing shows, and the field is asked afresh when one looks again */
  private lookAway(): void {
    this.nShown = 0;
    this.nFound = 0;
    this.askedR = -1;
    this.warmLeft = 0;
    this.freeDevices();
    this.view?.clear();
  }

  /**
   * The tiles of plants within r of (x, z) worked out before the field is asked: true when they all are.
   * A tile not yet asked for is asked for here, one layer of one tile every few steps (the first time a tile
   * is worked out it costs a third of a millisecond and more; the field's question would work out a dozen
   * at once). Tiles of the range that was worked out last are in the flora's cache and are not asked again.
   * (The place comes as an object: two fractions handed to a function are put on the heap.)
   */
  private warm(world: World, flora: FloraField, at: { readonly x: number; readonly z: number }, r: number): boolean {
    const tx0 = Math.floor((at.x - r) / ECO_TILE);
    const tx1 = Math.floor((at.x + r) / ECO_TILE);
    const tz0 = Math.floor((at.z - r) / ECO_TILE);
    const tz1 = Math.floor((at.z + r) / ECO_TILE);
    if (world !== this.warmWorld) {
      this.warmWorld = world;
      this.wx0 = 1;
      this.wx1 = 0;
      this.warmLeft = 0;
    }
    if (this.warmLeft === 0) {
      if (tx0 >= this.wx0 && tx1 <= this.wx1 && tz0 >= this.wz0 && tz1 <= this.wz1) return true;
      // (a range too wide for the queue — nothing asks for one — is left to the field's own question)
      const q = this.warmQueue;
      let n = 0;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (tx >= this.wx0 && tx <= this.wx1 && tz >= this.wz0 && tz <= this.wz1) continue;
          for (let layer = 0; layer < 3 && n + 3 <= q.length; layer++) {
            q[n++] = layer;
            q[n++] = tx;
            q[n++] = tz;
          }
        }
      }
      this.warmLeft = n;
      this.warmStep = 0;
      if (n === 0) {
        this.setWarm(tx0, tx1, tz0, tz1);
        return true;
      }
    }
    if (this.warmStep-- > 0) return false;
    this.warmStep = WARM_EVERY - 1;
    const q = this.warmQueue;
    const i = this.warmLeft - 3;
    // (asked for in the range as it is NOW: one that has since fallen out of it is passed over)
    if (q[i + 1] >= tx0 && q[i + 1] <= tx1 && q[i + 2] >= tz0 && q[i + 2] <= tz1) flora.tile(q[i] as FloraLayer, q[i + 1], q[i + 2]);
    this.warmLeft = i;
    if (i > 0) return false;
    // (the queue was made for the range of a moment ago: the next step sees whether one has moved on)
    this.setWarm(tx0, tx1, tz0, tz1);
    return false;
  }

  private setWarm(tx0: number, tx1: number, tz0: number, tz1: number): void {
    this.wx0 = tx0;
    this.wx1 = tx1;
    this.wz0 = tz0;
    this.wz1 = tz1;
  }

  /** of the plants found, those that show now: not picked and still regrowing, and in season */
  private sift(ctx: GameContext, world: World): void {
    const c = this.cond;
    c.hour = ctx.clock.hour;
    c.sinceRainH = this.sinceRainH();
    c.tide = tideAt(ctx.clock.worldSeconds);
    const day = ctx.clock.day;
    const found = this.found;
    const shown = this.shown;
    const picked = this.picked;
    let m = 0;
    for (let i = 0; i < this.nFound; i++) {
      const p = found[i];
      // (a point that bears again today is as good as forgotten: the table lets go of it at midnight)
      if (picked.size > 0 && picked.get(p.key) > day) continue;
      if (!forageShows(FORAGE_KINDS[p.kind], p.hidden, c)) continue;
      if (m < shown.length) shown[m] = p;
      else shown.push(p);
      m++;
    }
    this.nShown = m;
    if (m > this.aimY.length) {
      this.aimY = new Float32Array(m * 2);
      this.aimR = new Float32Array(m * 2);
    }
    for (let i = 0; i < m; i++) this.aimAt(world, shown[i], i);
    this.freeDevices();
    this.view?.show(shown, m, this.aimY, this.whereNow(ctx));
  }

  /**
   * Where the mark aims at a point, and how big it is to look at: a ground plant at half its height, a bush
   * at the middle of the bush, a tree at head height on its trunk (or, what fell under it, at its foot), a
   * plant of the water at the water's surface.
   */
  private aimAt(world: World, p: ForagePoint, i: number): void {
    const plant = PLANTS[p.plant];
    let y = p.y;
    let r: number;
    if (plant.layer === 'ground') {
      if (plant.aquatic) {
        // (the water's surface over it: asked of the land once a plant and kept — the land's answer leaves half a
        // kilobyte on the heap, measured, and the list is gone through three times a second)
        let wl = this.levels.get(p.key);
        if (wl !== wl) {
          world.shape(p.x, p.z, this.tp);
          wl = this.tp.wl > y ? this.tp.wl : y;
          this.levels.set(p.key, wl);
        }
        y = wl + AIM_OVER_WATER;
      } else y += Math.min(0.5, Math.max(0.08, plant.height * p.size * 0.6));
      r = Math.min(0.6, Math.max(0.3, plant.crown * p.size * 0.9 + 0.12));
    } else if (plant.layer === 'shrub') {
      y += Math.min(1.5, plant.height * p.size * 0.6);
      r = Math.min(0.9, Math.max(0.4, plant.crown * p.size * 0.75));
    } else if (p.on) {
      y += 1.45;
      r = 0.7;
    } else {
      y += 0.2;
      r = 0.9;
    }
    this.aimY[i] = y;
    this.aimR[i] = r;
  }

  // ---------------------------------------------------------------- the interactable source

  /** the devices no longer stand for any point (the list they pointed into was made again) */
  private freeDevices(): void {
    const ds = this.devices;
    for (let i = 0; i < ds.length; i++) ds[i].point = null;
  }

  /**
   * The points that show within r of `at`, each as a device. The devices are a few kept ones: a point keeps
   * the device it had last frame (its id is built once, when the point comes within reach).
   */
  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    const n = this.nShown;
    if (n === 0) return;
    const ds = this.devices;
    for (let i = 0; i < ds.length; i++) ds[i].used = false;
    const shown = this.shown;
    const x = at.x;
    const z = at.z;
    for (let i = 0; i < n; i++) {
      const p = shown[i];
      const dx = p.x - x;
      const dz = p.z - z;
      const reach = r + this.aimR[i];
      if (dx > reach || dx < -reach || dz > reach || dz < -reach || dx * dx + dz * dz > reach * reach) continue;
      const d = this.deviceFor(p);
      d.x = p.x;
      d.y = this.aimY[i];
      d.z = p.z;
      d.radius = this.aimR[i];
      out.push(d);
    }
  }

  /** the device that stands for a point: the one it had, else a free one (a new one when none is) */
  private deviceFor(p: ForagePoint): PointDevice {
    const ds = this.devices;
    let free: PointDevice | null = null;
    for (let i = 0; i < ds.length; i++) {
      const d = ds[i];
      if (d.key === p.key) {
        d.point = p;
        d.used = true;
        return d;
      }
      if (!d.used && !free) free = d;
    }
    if (!free) {
      free = new PointDevice(this);
      ds.push(free);
    }
    free.key = p.key;
    free.id = `forage:${p.key}`;
    free.point = p;
    free.used = true;
    return free;
  }

  // ---------------------------------------------------------------- the pick

  /** what the picker brings: the tools in the hotbar (looked for now, not every frame), the skill and its perks */
  private bonusNow(ctx: GameContext): PickBonus {
    const b = this.bonus;
    b.knife = b.trowel = b.sickle = false;
    const slots = ctx.player.slots;
    for (let i = 0; i < slots.length; i++) {
      const h = slots[i];
      if (h?.kind !== 'item') continue;
      const id = h.item.item;
      if (id === KNIFE) b.knife = true;
      else if (id === TROWEL) b.trowel = true;
      else if (id === SICKLE) b.sickle = true;
    }
    b.level = progress.level(FORAGE_SKILL_ID);
    b.double = progress.hasPerk(PERK_DOUBLE);
    b.star = progress.hasPerk(PERK_STAR);
    return b;
  }

  /**
   * E on a point: what it bears is in the hands at once (no bar to wait for). False when nothing was picked
   * (it is picked already, or the game is not there).
   */
  pick(p: ForagePoint): boolean {
    const ctx = this.ctx;
    const world = ctx?.world;
    if (!ctx || !world) return false;
    const day = ctx.clock.day;
    if (this.picked.get(p.key) > day) return false;
    const kind = FORAGE_KINDS[p.kind];
    const r = pickResult(kind, world.seed, p.key, day, p.vary, this.bonusNow(ctx), this.result);
    const n = r.n;
    const q = r.q;
    // into the hands, a stack at a time; what they do not take is put down by the feet
    const most = stackMax(kind.id);
    let left = 0;
    let kg = 0;
    for (let todo = n; todo > 0; ) {
      const k = Math.min(todo, most);
      todo -= k;
      const item = newItem(kind.id, { ...(k > 1 ? { n: k } : {}), q, t0: ctx.clock.worldSeconds });
      const rest = ctx.player.receive({ kind: 'item', item });
      kg += kind.item.mass * (k - rest);
      if (rest > 0) {
        left += rest;
        const w = ctx.player.walker;
        const l = ctx.loose.addItem(item, w.x + Math.cos(w.heading) * 0.45, w.y + 0.9, w.z + Math.sin(w.heading) * 0.45, w.heading + left);
        ctx.loose.drop(l);
      }
    }
    this.picked.set(p.key, day + kind.regrowDays);
    this.picks++;
    // (the name the thing went by as it was picked: a kind met for the first time may be named by the pick itself)
    const name = nameNow(p.kind);
    ctx.events.emit('forage:picked', { kind: kind.id, n, q, key: p.key });
    const first = meet(ctx, FORAGE_DOMAIN, kind.id, n, QUIET);
    ctx.sound('pickup', Math.max(0.05, kg));
    const en = ctx.ui.lang === 'en';
    const tail = `${first ? ` · ${en ? WORDS.first.en : WORDS.first.zh}` : ''}${left > 0 ? `（${en ? WORDS.atFeet.en : WORDS.atFeet.zh}）` : ''}`;
    announce(ctx, `+${n} ${en ? name.en : name.zh}${tail}`, 1.4);
    gainXp(ctx, FORAGE_SKILL_ID, r.xp * (first ? FIRST_PICK_XP : 1));
    // the point no longer shows: out of the list, and the view lets its plant shrink away
    this.view?.picked(p);
    this.unshow(p);
    return true;
  }

  /** a point taken out of those that show (the last one takes its place) */
  private unshow(p: ForagePoint): void {
    const shown = this.shown;
    for (let i = 0; i < this.nShown; i++) {
      if (shown[i] !== p) continue;
      const last = this.nShown - 1;
      shown[i] = shown[last];
      this.aimY[i] = this.aimY[last];
      this.aimR[i] = this.aimR[last];
      shown[last] = p;
      this.nShown = last;
      break;
    }
    const ds = this.devices;
    for (let i = 0; i < ds.length; i++) {
      if (ds[i].point !== p) continue;
      ds[i].point = null;
      ds[i].key = -1;
    }
  }

  // ---------------------------------------------------------------- what the game says to it

  /** a game begins: the kit is due where a new game starts in a world that has foraging (the workshop) */
  onNewGame(ctx: GameContext): void {
    this.kitDue = !this.kit && ctx.params.world >= 2 && ctx.params.start === 'garage' ? 1 : 0;
  }

  /** a game was taken up: one saved before there was a kit is given it once */
  onRestored(ctx: GameContext): void {
    this.kitDue = !this.kit && ctx.params.world >= 2 ? 2 : 0;
  }

  /** midnight: the points that bear again are forgotten */
  onDay(day: number): void {
    this.picked.dropDue(day);
  }

  /**
   * A knife and a basket put down a step ahead of where one stands (a new game: by the workshop's door,
   * where it begins), and the flag set: once a journey.
   */
  private giveKit(ctx: GameContext): void {
    const why = this.kitDue;
    this.kitDue = 0;
    this.kit = true;
    const w = ctx.player.walker;
    const c = Math.cos(w.heading);
    const s = Math.sin(w.heading);
    const put = (id: string, ahead: number, side: number): void => {
      const l = ctx.loose.addItem(newItem(id), w.x + c * ahead - s * side, w.y + 0.7, w.z + s * ahead + c * side, w.heading + side * 2);
      ctx.loose.drop(l);
    };
    put(KNIFE, 1.5, -0.32);
    put(BASKET, 1.6, 0.34);
    // (a new game says nothing: the two lie in front of one. A game taken up is told why they are there)
    if (why === 2) announce(ctx, ctx.ui.lang === 'en' ? 'A foraging knife and a basket are at your feet.' : '脚边多了一把小刀和一个采集篮：采东西用得上。', 3);
  }

  /** something was eaten: a forage kind tasted is known from now on (the toxic ones hurt through their item's own `eat`) */
  onAte(ctx: GameContext, id: string): void {
    const i = KIND_INDEX.get(id);
    if (i === undefined) return;
    const was = veilOf(i);
    const k = FORAGE_KINDS[i];
    // (the name it went by, before it is learnt)
    const before = nameNow(i);
    learn(ctx, FORAGE_DOMAIN, id, 'taste', QUIET);
    if (was === KNOWN) return;
    const en = ctx.ui.lang === 'en';
    const sick = k.item.eat?.effect === 'sick1' || k.item.eat?.effect === 'sick2';
    const line = en
      ? `${was === MISTAKEN ? `That was no ${before.en}: it is ${k.name.en}.` : `Tasted: it is ${k.name.en}.`}${sick ? ' It does not sit well…' : ''}`
      : `${was === MISTAKEN ? `尝出来了：这不是${before.zh}，是${k.name.zh}！` : `尝出来了：是${k.name.zh}。`}${sick ? '肚子开始不对劲了……' : ''}`;
    announce(ctx, line, 3);
  }

  /** the skill reached a level: the kinds it teaches by sight are known from now on (one line for the lot) */
  onLevel(ctx: GameContext, from: number, level: number): void {
    let news = 0;
    let steps = 0;
    let what = '';
    for (const [rarity, at] of Object.entries(KNOWN_FROM)) {
      if (!(at > from && at <= level)) continue;
      const n = learnMany(ctx, FORAGE_DOMAIN, kindsTaughtAt(at), 'skill');
      if (n > 0) {
        steps++;
        what = rarity;
      }
      news += n;
    }
    if (progress.hasPerk(PERK_TWINS)) {
      const n = learnMany(ctx, FORAGE_DOMAIN, twinKinds(), 'skill');
      if (n > 0) {
        steps++;
        what = 'twins';
      }
      news += n;
    }
    if (news === 0) return;
    const en = ctx.ui.lang === 'en';
    const zh: Record<string, string> = { common: '常见的野货，现在一眼就认得出了。', uncommon: '不那么常见的野货，现在也认得出了。', rare: '少见的野货，现在也认得出了。', twins: '长得像的毒蘑菇，现在分得清了。' };
    const one = steps === 1 ? zh[what] : undefined;
    announce(ctx, en ? `You now know ${news} more kinds by sight.` : (one ?? `又认得 ${news} 种野货了。`), 2.6);
  }

  /** a page of the compendium in the hands is read: every kind of its category is known */
  private readPages(ctx: GameContext): void {
    // (nothing learnt or forgotten since the pages in the hands were last read: they have nothing new to say)
    if (progressRev() === this.pagesAt) return;
    const slots = ctx.player.slots;
    for (let i = 0; i < slots.length; i++) {
      const h = slots[i];
      if (h?.kind !== 'item') continue;
      const cat = PAGE_CAT.get(h.item.item);
      if (cat === undefined) continue;
      const n = learnMany(ctx, FORAGE_DOMAIN, kindsOfCat(cat), 'page');
      if (n > 0) announce(ctx, ctx.ui.lang === 'en' ? `Read the page: ${n} kinds of ${FORAGE_CATS[cat].name.en.toLowerCase()} are known now.` : `翻了翻图鉴页：${FORAGE_CATS[cat].name.zh}里的 ${n} 种，现在都认得了。`, 3);
    }
    this.pagesAt = progressRev();
  }

  // ---------------------------------------------------------------- the save slice

  /**
   * About twenty bytes of save text a picked point, and a point is forgotten at the midnight from which it
   * bears again (2 to 14 game days): the slice holds what was picked in the last days and no more, however
   * long the journey. A hundred points a day picked without a break come to 6 KB or so.
   */
  readonly slice: SaveSlice<ForageSaved> = {
    id: 'forage',
    version: 1,
    snapshot: () => {
      if (this.picked.size === 0 && this.rainS < 0 && !this.kit) return undefined;
      const s: ForageSaved = { p: this.picked.flat() };
      if (this.rainS >= 0) s.rain = Math.round(this.rainS);
      if (this.kit) s.kit = true;
      return s;
    },
    restore: (data) => {
      const d = (data && typeof data === 'object' ? data : {}) as Partial<ForageSaved>;
      this.picked.load(d.p);
      this.rainS = typeof d.rain === 'number' && Number.isFinite(d.rain) && d.rain >= 0 ? d.rain : -1;
      this.kit = d.kit === true;
      // (what shows is worked out again from what is remembered)
      this.askedR = -1;
    },
    clear: () => {
      this.picked.clear();
      this.rainS = -1;
      this.kit = false;
      this.askedR = -1;
    },
  };

  // ---------------------------------------------------------------- for the developer's tab and the scripts

  /** every picked point bears again now; returns how many there were */
  regrowAll(): number {
    const n = this.picked.size;
    this.picked.clear();
    this.lookT = LOOK_S;
    return n;
  }

  /** it rains (true: the weather forced to rain, and counted as having rained just now) or the schedule's weather again */
  rain(on: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const weather = (ctx.env as { weather?: { force: string | null } }).weather;
    if (weather) weather.force = on ? 'rain' : null;
    if (on) this.rainS = ctx.clock.worldSeconds;
    this.lookT = LOOK_S;
  }

  /** the tide now (−1 … 1) and how many game seconds until it is next low (0: it is) */
  tide(): { tide: number; nextLowS: number } {
    const s = this.ctx ? this.ctx.clock.worldSeconds : 0;
    return { tide: tideAt(s), nextLowS: nextLowTide(s) };
  }

  /** the points that show now, nearest first (copies: for the scripts and the tests) */
  shownNow(most = 1000): { key: number; kind: string; plant: string; layer: string; x: number; y: number; z: number; aimY: number; radius: number; dist: number; vary: number; size: number; hidden: boolean; on: boolean }[] {
    const at = this.ctx ? this.whereNow(this.ctx) : this.here;
    const out = [];
    for (let i = 0; i < this.nShown; i++) {
      const p = this.shown[i];
      out.push({ key: p.key, kind: FORAGE_KINDS[p.kind].id, plant: PLANTS[p.plant].id, layer: PLANTS[p.plant].layer, x: p.x, y: p.y, z: p.z, aimY: this.aimY[i], radius: this.aimR[i], dist: Math.hypot(p.x - at.x, p.z - at.z), vary: p.vary, size: p.size, hidden: p.hidden, on: p.on });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, most);
  }

  /** the point of a key among those that show (null: it does not show) */
  private pointOf(key: number): ForagePoint | null {
    for (let i = 0; i < this.nShown; i++) if (this.shown[i].key === key) return this.shown[i];
    return null;
  }

  /** the robot's part of a step: towards the nearest point that shows within its stop, and the pick when it is there */
  private robotStep(dt: number, ctx: GameContext): void {
    const rb = this.robot;
    if (ctx.seated) return;
    rb.seconds += dt;
    const w = ctx.player.walker;
    let best: ForagePoint | null = null;
    let bd = Infinity;
    for (let i = 0; i < this.nShown; i++) {
      const p = this.shown[i];
      const sx = p.x - rb.x0;
      const sz = p.z - rb.z0;
      if (sx * sx + sz * sz > rb.r * rb.r) continue;
      const d = (p.x - w.x) * (p.x - w.x) + (p.z - w.z) * (p.z - w.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (!best) {
      // (nothing shows yet while the tiles about are worked out and the first look has not been taken)
      if (this.askedR >= 0 && this.warmLeft === 0) {
        rb.on = false;
        rb.done = true;
      }
      return;
    }
    const d = Math.sqrt(bd);
    if (d <= ROBOT_REACH) {
      if (this.pick(best)) {
        rb.picked++;
        rb.portions += this.result.n;
      }
      if (rb.most > 0 && rb.picked >= rb.most) {
        rb.on = false;
        rb.done = true;
      }
      return;
    }
    const go = Math.min(d - ROBOT_REACH * 0.8, ROBOT_SPEED * dt);
    const nx = w.x + ((best.x - w.x) / d) * go;
    const nz = w.z + ((best.z - w.z) / d) * go;
    rb.walked += go;
    const heading = Math.atan2(best.z - w.z, best.x - w.x);
    const place = (w as { place?: (x: number, z: number, heading: number) => void }).place;
    if (place) place.call(w, nx, nz, heading);
    else {
      w.x = nx;
      w.z = nz;
      w.heading = heading;
    }
  }

  /** for test scripts: game.systems.harness('forage', name, ...args) */
  readonly harness = {
    /** the points that show now, nearest first */
    shown: (most?: unknown) => this.shownNow(typeof most === 'number' ? most : 1000),
    /** pick the point of this key as E would (false: it does not show) */
    pick: (key: unknown) => {
      const p = this.pointOf(Number(key));
      return p ? this.pick(p) : false;
    },
    /**
     * The robot forager set going where one stands: it walks to the nearest point that shows within `radius`
     * (60 m) of there and picks it, again and again, until none is left (or `most` were picked). The script
     * steps the game and asks `robotReport`.
     */
    robot: (radius?: unknown, most?: unknown) => {
      const ctx = this.ctx;
      if (!ctx) return false;
      const w = ctx.player.walker;
      Object.assign(this.robot, { on: true, done: false, x0: w.x, z0: w.z, r: typeof radius === 'number' ? radius : 60, seconds: 0, picked: 0, portions: 0, walked: 0, most: typeof most === 'number' ? most : 0 });
      return true;
    },
    robotStop: () => void (this.robot.on = false),
    /** what the robot did at this stop: points picked, game seconds for the stop and for a point, metres walked */
    robotReport: () => {
      const rb = this.robot;
      return { on: rb.on, done: rb.done, picked: rb.picked, portions: rb.portions, seconds: rb.seconds, perPoint: rb.picked > 0 ? rb.seconds / rb.picked : 0, walked: rb.walked };
    },
    regrow: () => this.regrowAll(),
    rain: (on: unknown) => this.rain(on !== false),
    tide: () => this.tide(),
    mark: (on: unknown) => void (this.mark = on !== false),
    /** how a kind stands with the player: 0 known, 1 unknown, 2 taken for its twin; and what it is called now */
    veil: (id: unknown) => {
      const i = KIND_INDEX.get(String(id));
      return i === undefined ? null : { state: veilOf(i), name: nameNow(i).zh };
    },
    picked: () => this.picked.size,
    slice: () => this.slice.snapshot() ?? null,
    /**
     * The bearing plants of a kind within `radius` (150 m) of where one stands, nearest first, asked of the
     * field itself: whether they show now or not, picked or not (a script looks for a clam bed at high tide).
     * `kind`: a forage kind's id, or '' for every kind. Not for a frame's path: it works out the tiles it needs.
     */
    find: (kind: unknown, radius?: unknown, most?: unknown) => {
      const ctx = this.ctx;
      const flora = ctx?.world?.flora;
      if (!ctx || !flora) return [];
      const at = this.whereNow(ctx);
      const r = typeof radius === 'number' ? radius : 150;
      const all: ForagePoint[] = [];
      const n = new ForageField(flora).near(at.x, at.z, r, all);
      const out = [];
      for (let i = 0; i < n; i++) {
        const p = all[i];
        const id = FORAGE_KINDS[p.kind].id;
        if (kind && id !== kind) continue;
        out.push({ key: p.key, kind: id, plant: PLANTS[p.plant].id, layer: PLANTS[p.plant].layer, model: PLANTS[p.plant].model, x: p.x, y: p.y, z: p.z, size: p.size, dist: Math.hypot(p.x - at.x, p.z - at.z) });
      }
      return out.sort((a, b) => a.dist - b.dist).slice(0, typeof most === 'number' ? most : 40);
    },
  };
}

const QUIET = { quiet: true } as const;

/**
 * A number kept for each of a thousand points, by the point's key (the water's surface over a plant of the
 * water): keys in a typed array, so that asking allocates nothing (picked.ts says why not a Map). When it is
 * half full it is emptied and begun again: what it holds is only ever asked of the land a second time.
 */
class LevelCache {
  private static readonly SIZE = 2048;
  private readonly keys = new Float64Array(LevelCache.SIZE).fill(-1);
  private readonly values = new Float64Array(LevelCache.SIZE);
  private n = 0;

  private slot(key: number): number {
    // (the key's low bits are the cell along z, the next ones the cell along x: both mixed in)
    const mask = LevelCache.SIZE - 1;
    let i = ((key % 2097152) * 31 + Math.floor(key / 2097152)) & mask;
    while (this.keys[i] !== -1 && this.keys[i] !== key) i = (i + 1) & mask;
    return i;
  }

  /** the number kept for a key; NaN: none */
  get(key: number): number {
    const i = this.slot(key);
    return this.keys[i] === key ? this.values[i] : NaN;
  }

  set(key: number, value: number): void {
    if (this.n >= LevelCache.SIZE / 2) this.clear();
    const i = this.slot(key);
    if (this.keys[i] !== key) this.n++;
    this.keys[i] = key;
    this.values[i] = value;
  }

  clear(): void {
    this.keys.fill(-1);
    this.n = 0;
  }
}
