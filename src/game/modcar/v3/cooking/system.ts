/**
 * The cooking system (node C1, docs/V3/nodes/C1-cooking.md): the stations one cooks at, the pots on their
 * flames, the buffs a meal leaves, and eating a dish.
 *
 * Stations. A fire ring of a place within reach (sites.ts objects of kind 'firering'; the fire is lit by
 * cooking at it), a camp stove set down (a cook_stove lying on the ground), the workshop's kitchen corner (a
 * counter in the yard by the doors, every way of cooking, its pans hanging over it), and the ways of keeping:
 * a drying rack and a smoker set down. Twice a second, on foot, the system looks for those within 30 m and
 * keeps them (and every station with a pot on it, however far); within reach each is a device E works: "做饭"
 * opens the cooking panel (the modal, session.ts the logic, panel.ts what is drawn). Which ways of cooking a
 * station offers comes from the cookware at hand (content.ts STATION_GEAR: what it has of its own, what of the
 * hotbar's — and for a stove, of what lies within 2 m — it can use).
 *
 * Pots. A pot on a flame is stepped every frame whether the panel is open or not (pot.ts stepCook): a soup left
 * at a low flame waits for one, a stew left on a high one goes over. What is cooking where is in the save.
 *
 * Buffs. The core's Buffs (two meal places, one drink place) are stepped with the frame's seconds and written
 * into the body's mods in preStep (buffs.ts buffBodyMods), so the body is stepped with them that same frame. A
 * buff that begins and one that runs out are each said in one line (never while one drives: progress/api.ts).
 *
 * Eating. A dish's item says nothing to the body by itself (its `eat` is empty): on body:ate of a dish this
 * gives what ItemState.dish says — food and health over the usual seconds (vitals.ts eat), water as a drink
 * of water would (drink: the bladder too), the sickness it carries, and its buff, in a meal's place or, for a
 * drink, in the drink's.
 *
 * The jar. A pickling jar (a container item) ripens what is put in it into the 'pickle' dish after 12 game
 * hours, or 15 km driven while it rides in a vehicle, whichever comes first.
 *
 * Nothing of the system's own in the three hooks or in `near` allocates while nothing happens: the stations
 * are an array the hooks go through by index, the looking about reuses its lists (harness/sim/v3_cooking_module.test.ts).
 */
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { System } from '../../../../core/kernel/systems';
import { cleanItem, countOf, forEachItem, freshNow, freshStage, itemDef, newItem, reserveItemUids, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { drink, eat } from '../../../../core/modcar/vitals';
import { BUFFS, buffBodyMods, Buffs, type BuffsSave } from '../../../../core/v3/cooking/buffs';
import { ingredient } from '../../../../core/v3/cooking/ingredients';
import { dishItem, type DishState } from '../../../../core/v3/cooking/items';
import { RECIPES, recipe as recipeById } from '../../../../core/v3/cooking/recipes';
import { cook } from '../../../../core/v3/cooking/rules';
import { AUTO_SEASON, METHOD_STEPS, newPot } from '../../../../core/v3/cooking/steps';
import { METHODS, POT_MAX, type BuffId, type Dish, type DishClass, type Method } from '../../../../core/v3/cooking/types';
import type { Site } from '../../../../core/world/sites';
import { Solid, type SolidSource } from '../../../../core/world/solids';
import type { GarageDevice } from '../../garageStub';
import type { ItemCard } from '../../itemInfo';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Modal, ModalClose } from '../../kernel/modal';
import type { Loose } from '../../loose';
import { announce, gainXp, learn, learnMany, meet, progress, progressRev } from '../progress/api';
import { COOK_DOMAIN, COOK_SKILL_ID, EXTRA_CHANCE, KITCHEN, PAGE_CLASS, PANTRY_M, PERK_EXTRA, PERK_KEEP, PERK_MASTER, PERK_TASTE, POT_METHODS, STATION_GEAR, STATION_NAME, STATION_REACH, STOVE_GEAR_M, WORDS, XP_FIRST, XP_FREE, XP_RECIPE, XP_STAR, type StationKind } from './content';
import { intoHandsOrFeet, pantryRows, takePortion, type PantryPlace } from './pantry';
import { keeps, newPotState, stepCook, type PotState } from './pot';
import { RobotCook, type RobotHands, type RobotPlan } from './robot';
import { CookSession, type PantryRow } from './session';

/** how far the system looks for stations (m), and how often (s); a station this far off without a pot is let go */
const LOOK_M = 30;
const LOOK_S = 0.5;
const FORGET_M = 45;
/** a fire ring burns this long after the last cooking at it (s) */
const FIRE_S = 150;
/** the pickling jar: game hours, or km driven riding in a vehicle, until what is in it is ripe; how often the jars are looked at (s) */
export const JAR_HOURS = 12;
export const JAR_KM = 15;
const JAR_S = 2;
/** how high over its base the pot sits on each station (m), and how big a station is to the mark */
const POT_Y: Readonly<Record<StationKind, number>> = { fire: 0.32, stove: 0.2, kitchen: KITCHEN.hobY, rack: 0.55, smoker: 0.6 };
const MARK_R: Readonly<Record<StationKind, number>> = { fire: 0.55, stove: 0.26, kitchen: 0.5, rack: 0.4, smoker: 0.35 };
/** what a station set down is, by its item */
const LYING: Readonly<Record<string, StationKind>> = { cook_stove: 'stove', cook_rack: 'rack', cook_smoker: 'smoker' };

declare module '../../../../core/kernel/events' {
  interface GameEvents {
    /** a dish came out of a pot: which (its recipe, or none), how many servings, how many stars, at what kind of station */
    'cooking:plated': { readonly recipe: string | null; readonly name: string; readonly servings: number; readonly stars: number; readonly station: StationKind };
    /** a buff began (from a dish eaten, or the developer's hand) */
    'cooking:buff': { readonly buff: BuffId; readonly seconds: number };
  }
}

/** a place one cooks at */
export class Station {
  readonly device: StationDevice;
  kind: StationKind;
  /** where the pot sits (world) */
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  /** the thing set down that is the station (a stove, a rack, a smoker) */
  loose: Loose | null = null;
  pot: PotState | null = null;
  /** a fire ring: seconds it still burns */
  fire = 0;
  /** found in the last look about */
  seen = true;

  constructor(
    readonly key: string,
    kind: StationKind,
    owner: Cooking,
  ) {
    this.kind = kind;
    this.device = new StationDevice(this, owner);
  }
}

/** a station within reach, as the mark finds it */
class StationDevice implements GarageDevice {
  readonly id: string;
  x = 0;
  y = 0;
  z = 0;
  radius = 0.5;

  constructor(
    private readonly st: Station,
    private readonly owner: Cooking,
  ) {
    this.id = `cooking:${st.key}`;
  }

  get word(): Text {
    return this.st.kind === 'rack' || this.st.kind === 'smoker' ? WORDS.keep : WORDS.cook;
  }

  get state(): Text {
    return this.owner.stateWords(this.st);
  }

  get card(): ItemCard | undefined {
    return undefined;
  }

  use(): void {
    this.owner.openAt(this.st);
  }
}

/** the save's slice */
export interface CookingSaved {
  /** the buffs active, with their time left */
  b?: BuffsSave;
  /** each recipe cooked, how often */
  n?: Record<string, number>;
  /** what is cooking where */
  pots?: { k: string; kind: StationKind; x: number; y: number; z: number; f?: number; s: PotState }[];
  /** each pickling jar's ripening: its uid, the world's second it began, km driven since */
  jars?: { u: string; t: number; km: number }[];
}

export class Cooking implements System<GameContext>, InteractSource {
  readonly id = 'cooking';
  readonly budget = { cpuMs: 0.2 };

  private ctx: GameContext | null = null;
  /** the buffs a meal leaves (the core's table) */
  readonly buffs = new Buffs();
  /** each recipe cooked, how often */
  readonly cooked = new Map<string, number>();

  // ---- the stations: an array the hooks go through, maps to find one by its key and by the thing it is (a
  // site's fire ring, a stove set down: found again without a key being built every look)
  readonly stations: Station[] = [];
  private readonly byKey = new Map<string, Station>();
  private readonly byThing = new Map<object, Station>();
  private lookT = LOOK_S;
  private readonly sites: Site[] = [];
  /** the workshop's counter keeps the walker out */
  private kitchenSolid: SolidSource | null = null;

  // ---- the panel
  readonly session: CookSession;
  /** the station the panel is open at (null: shut) */
  open: Station | null = null;
  private readonly modal: Modal;
  /** what is drawn of the panel (panel.ts in a game that draws; nothing in Node) */
  panel: CookPanelView | null = null;
  makePanel: ((ctx: GameContext, c: Cooking) => CookPanelView | null) | null = null;
  /** what is drawn of the stations (view.ts) and of the buffs (buffHud.ts) */
  view: CookShow | null = null;
  makeView: ((ctx: GameContext, c: Cooking) => CookShow | null) | null = null;
  hud: BuffShow | null = null;
  makeHud: ((ctx: GameContext, c: Cooking) => BuffShow | null) | null = null;

  // ---- buffs said as they run out
  private readonly before: (BuffId | null)[] = [null, null, null, null, null, null];

  // ---- jars ripening: by the jar's uid
  private readonly jars = new Map<string, { t: number; km: number }>();
  private jarT = 0;

  // ---- the robot cook
  private robot: RobotCook | null = null;
  /** the dice of the perk cook_extra: counted on with every dish */
  private plates = 0;
  /** the Progress's count of changes at which the pages in the hands were last read */
  private pagesAt = -1;
  private pageT = 0;

  constructor() {
    const self = this;
    this.session = new CookSession({
      now: () => (self.ctx ? self.ctx.clock.worldSeconds : 0),
      methods: () => (self.open ? self.methodsAt(self.open) : []),
      pantry: () => (self.ctx && self.open ? pantryRows(self.ctx, self.open.x, self.open.z, PANTRY_M) : []),
      takeOne: (row: PantryRow) => (self.ctx ? takePortion(self.ctx, row as PantryPlace, self.ctx.clock.worldSeconds) : null),
      giveBack: (item: ItemInstance) => {
        if (self.ctx) intoHandsOrFeet(self.ctx, item);
      },
      timesCooked: (r) => self.cooked.get(r) ?? 0,
      known: (r) => progress.knowledge(COOK_DOMAIN, r) === 2,
      perks: () => ({ taste: progress.hasPerk(PERK_TASTE), master: progress.hasPerk(PERK_MASTER), extra: progress.hasPerk(PERK_EXTRA) && self.extraRoll() }),
      plated: (dish, s) => self.plated(dish, s),
      sound: (name, gain) => self.ctx?.sound(name, gain),
    });
    this.modal = {
      id: 'cooking',
      mouse: true,
      key: (code) => this.session.key(code),
      wheel: (dy) => this.session.wheel(dy),
      near: () => this.stillNear(),
      closed: (why) => this.closed(why),
    };
  }

  // ---------------------------------------------------------------- the system

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.reset();
    this.view?.dispose();
    this.view = this.makeView ? this.makeView(ctx, this) : null;
    this.panel?.dispose();
    this.panel = this.makePanel ? this.makePanel(ctx, this) : null;
    this.hud?.dispose();
    this.hud = this.makeHud ? this.makeHud(ctx, this) : null;
    // the workshop's kitchen corner, where a journey begins at the workshop
    if (ctx.params.start === 'garage') {
      const k = this.station('kitchen', 'kitchen');
      k.x = KITCHEN.x;
      k.y = KITCHEN.hobY;
      k.z = KITCHEN.z;
      k.heading = KITCHEN.heading;
      const solid = new Solid().set(KITCHEN.x, KITCHEN.z, KITCHEN.d / 2, KITCHEN.w / 2, KITCHEN.heading, -0.2, KITCHEN.h + 0.6, false, 'cooking:kitchen');
      this.kitchenSolid = {
        solidsNear: (x, z, r, out) => {
          const dx = x - KITCHEN.x;
          const dz = z - KITCHEN.z;
          if (dx * dx + dz * dz < (r + 1.2) * (r + 1.2)) out.push(solid);
        },
      };
      ctx.player.addSolids?.(this.kitchenSolid);
    }
  }

  /** as a game begins: no buffs, nothing cooked, nothing on any flame */
  private reset(): void {
    this.buffs.clear();
    this.cooked.clear();
    this.jars.clear();
    for (const st of this.stations) st.pot = null;
    this.stations.length = 0;
    this.byKey.clear();
    this.byThing.clear();
    this.robot = null;
    this.open = null;
    this.session.close();
    this.lookT = LOOK_S;
    this.pagesAt = -1;
  }

  /** before the body is stepped: the buffs run down and say what they do to it; the robot cook's hands */
  preStep(dt: number, ctx: GameContext): void {
    const b = this.buffs;
    if (b.count > 0) {
      const n = b.count;
      for (let i = 0; i < this.before.length; i++) this.before[i] = i < n ? b.at(i) : null;
      if (b.step(dt) > 0) this.ranOut(ctx);
      buffBodyMods(b, ctx.bodyMods);
    }
    const r = this.robot;
    if (r && this.open && !r.report.done) r.tick(dt);
  }

  /** the pots on their flames cook; the fires burn down; twice a second the stations about are looked for */
  step(dt: number, ctx: GameContext): void {
    const list = this.stations;
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      const p = st.pot;
      if (p && p.lit) stepCook(p, dt);
      if (st.kind === 'fire') {
        if (this.open === st || (p && p.lit)) st.fire = FIRE_S;
        else if (st.fire > 0) st.fire -= dt;
      }
    }
    if (this.open) this.session.step(dt);
    this.lookT += dt;
    if (this.lookT >= LOOK_S) {
      this.lookT = 0;
      if (!ctx.seated) this.lookAbout(ctx);
    }
    this.jarT += dt;
    if (this.jarT >= JAR_S) {
      this.ripenJars(ctx, this.jarT);
      this.jarT = 0;
    }
    this.pageT += dt;
    if (this.pageT >= 0.5) {
      this.pageT = 0;
      this.readPages(ctx);
    }
  }

  /** with the floating origin final: what is drawn of the stations, the panel and the buffs */
  lateUpdate(dt: number, ctx: GameContext): void {
    this.view?.update(dt, ctx, this);
    this.panel?.update(dt);
    this.hud?.update(dt, this.buffs);
  }

  dispose(): void {
    this.view?.dispose();
    this.view = null;
    this.panel?.dispose();
    this.panel = null;
    this.hud?.dispose();
    this.hud = null;
    if (this.open && this.ctx) this.ctx.modal.close(this.modal);
    if (this.kitchenSolid && this.ctx) this.ctx.player.removeSolids?.(this.kitchenSolid);
    this.kitchenSolid = null;
    this.ctx = null;
    this.robot = null;
  }

  telemetry(): Record<string, unknown> {
    let pots = 0;
    for (const st of this.stations) if (st.pot && st.pot.items.length) pots++;
    const buffs: string[] = [];
    for (let i = 0; i < this.buffs.count; i++) buffs.push(`${this.buffs.at(i)} ${Math.round(this.buffs.left(this.buffs.at(i)))}s`);
    return { stations: this.stations.length, pots, open: this.open?.key ?? null, buffs, cooked: this.cooked.size };
  }

  // ---------------------------------------------------------------- the stations

  private station(key: string, kind: StationKind): Station {
    let st = this.byKey.get(key);
    if (!st) {
      st = new Station(key, kind, this);
      this.byKey.set(key, st);
      this.stations.push(st);
    }
    st.seen = true;
    return st;
  }

  private forget(st: Station): void {
    const i = this.stations.indexOf(st);
    if (i >= 0) this.stations.splice(i, 1);
    this.byKey.delete(st.key);
    for (const [thing, s] of this.byThing) if (s === st) this.byThing.delete(thing);
  }

  /** the station of a thing (a site's fire ring, a thing set down), made the first time it is met: its key is `kind:id` or `kind:id:k` */
  private stationOf(thing: object, kind: StationKind, id: string, k: number): Station {
    let st = this.byThing.get(thing);
    if (!st) {
      st = this.station(k >= 0 ? `${kind}:${id}:${k}` : `${kind}:${id}`, kind);
      this.byThing.set(thing, st);
    }
    st.seen = true;
    return st;
  }

  /** the fire rings of the places about, the stoves, racks and smokers set down; those far off with nothing on them let go */
  private lookAbout(ctx: GameContext): void {
    const w = ctx.player.walker;
    const x = w.x;
    const z = w.z;
    for (let i = 0; i < this.stations.length; i++) if (this.stations[i].kind !== 'kitchen') this.stations[i].seen = false;
    const world = ctx.world;
    if (world) {
      const s = world.spine.sAtX(x);
      const sites = this.sites;
      while (sites.length > 0) sites.pop();
      world.sites.between(s - LOOK_M - 60, s + LOOK_M + 60, sites);
      for (let i = 0; i < sites.length; i++) {
        const site = sites[i];
        if ((site.x - x) * (site.x - x) + (site.z - z) * (site.z - z) > (site.reach + LOOK_M) * (site.reach + LOOK_M)) continue;
        const objs = site.objects;
        for (let k = 0; k < objs.length; k++) {
          const o = objs[k];
          if (o.kind !== 'firering' || (o.x - x) * (o.x - x) + (o.z - z) * (o.z - z) > LOOK_M * LOOK_M) continue;
          const st = this.stationOf(o, 'fire', site.id, k);
          st.x = o.x;
          st.y = o.y + POT_Y.fire;
          st.z = o.z;
          st.heading = o.yaw;
        }
      }
    }
    const list = ctx.loose.list;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const it = l.item;
      if (!it) continue;
      const kind = LYING[it.item];
      if (!kind || l.riding || (l.x - x) * (l.x - x) + (l.z - z) * (l.z - z) > LOOK_M * LOOK_M) continue;
      const st = this.stationOf(l, kind, it.uid, -1);
      st.loose = l;
      st.x = l.x;
      st.y = l.y + POT_Y[kind];
      st.z = l.z;
      st.heading = l.yaw;
    }
    for (let i = this.stations.length - 1; i >= 0; i--) {
      const st = this.stations[i];
      if (st.seen || st.kind === 'kitchen') continue;
      // a stove picked up (or gone): what was cooking on it is set down where it stood
      if (st.loose && !list.includes(st.loose)) {
        if (st.pot) this.spill(ctx, st);
        if (this.open === st) ctx.modal.close(this.modal, 'away');
        this.forget(st);
        continue;
      }
      const far = (st.x - x) * (st.x - x) + (st.z - z) * (st.z - z) > FORGET_M * FORGET_M;
      if (far && (!st.pot || !st.pot.items.length) && st.fire <= 0) this.forget(st);
    }
  }

  /** a station's pot spilt: what was in it is set down where the station was, as it went in */
  private spill(ctx: GameContext, st: Station): void {
    const p = st.pot;
    st.pot = null;
    if (!p) return;
    for (const it of p.items) ctx.loose.drop(ctx.loose.addItem(it, st.x, st.y + 0.3, st.z, 0));
  }

  /** the cookware at hand for a station: what it has of its own, and what of the hotbar's (a stove: and of what lies by it) it can use */
  methodsAt(st: Station): Method[] {
    const ctx = this.ctx;
    const gear = STATION_GEAR[st.kind];
    const have = new Set<string>(gear.own);
    if (ctx && gear.takes.length) {
      const slots = ctx.player.slots;
      for (let i = 0; i < slots.length; i++) {
        const h = slots[i];
        if (h?.kind !== 'item' || !h.item.item.startsWith('cook_')) continue;
        const id = h.item.item.slice(5);
        if (gear.takes.includes(id)) have.add(id);
      }
      if (st.kind === 'stove') {
        for (const l of ctx.loose.list) {
          const id = l.item?.item;
          if (!id?.startsWith('cook_') || (l.x - st.x) * (l.x - st.x) + (l.z - st.z) * (l.z - st.z) > STOVE_GEAR_M * STOVE_GEAR_M) continue;
          if (gear.takes.includes(id.slice(5))) have.add(id.slice(5));
        }
      }
    }
    if (st.kind === 'rack') return ['dry'];
    if (st.kind === 'smoker') return ['smoke'];
    return POT_METHODS.filter((m) => METHODS[m].cookware.some((c) => have.has(c)));
  }

  /** the devices of the stations within r of `at` (a few: allocates nothing) */
  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    const list = this.stations;
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      const dx = st.x - at.x;
      const dz = st.z - at.z;
      const reach = r + MARK_R[st.kind];
      if (dx > reach || dx < -reach || dz > reach || dz < -reach || dx * dx + dz * dz > reach * reach) continue;
      const d = st.device;
      d.x = st.x;
      d.y = st.y;
      d.z = st.z;
      d.radius = MARK_R[st.kind];
      out.push(d);
    }
  }

  /** what the prompt says of a station as it stands ("汤在锅里：正好", "篝火") */
  stateWords(st: Station): Text {
    const p = st.pot;
    if (!p || !p.items.length) return STATION_NAME[st.kind];
    if (p.phase === 'pick') return { zh: `${STATION_NAME[st.kind].zh} · 锅里有 ${p.items.length} 份`, en: `${STATION_NAME[st.kind].en} · ${p.items.length} in the pot` };
    if (p.phase === 'keep') return { zh: `${STATION_NAME[st.kind].zh} · 正在${METHODS[p.method].name.zh}`, en: `${STATION_NAME[st.kind].en} · ${METHODS[p.method].name.en}` };
    return { zh: `${STATION_NAME[st.kind].zh} · ${p.phase === 'plate' ? '可以装盘了' : '锅里正煮着'}`, en: `${STATION_NAME[st.kind].en} · ${p.phase === 'plate' ? 'ready to plate' : 'cooking'}` };
  }

  // ---------------------------------------------------------------- the panel

  /** E at a station: the panel opens on its pot (a fire ring is lit by it) */
  openAt(st: Station): boolean {
    const ctx = this.ctx;
    if (!ctx || ctx.seated) return false;
    // (the session asks for the ways the station offers as it opens)
    this.open = st;
    const p = this.session.open(st.pot, (made) => (st.pot = made));
    if (!p) {
      this.open = null;
      announce(ctx, ctx.ui.lang === 'en' ? 'Nothing to cook with here: bring a pan or a pot.' : '这里没有能用的锅：手上带一口锅或者一把平底锅再来。', 2.4);
      return false;
    }
    if (st.kind === 'fire') st.fire = FIRE_S;
    ctx.modal.open(this.modal);
    this.panel?.show(st);
    ctx.sound(st.kind === 'fire' ? 'flame' : 'putdown', 0.5);
    return true;
  }

  /** shut the panel (the pot stays as it is) */
  closePanel(): void {
    if (this.ctx && this.open) this.ctx.modal.close(this.modal);
  }

  private stillNear(): boolean {
    const ctx = this.ctx;
    const st = this.open;
    if (!ctx || !st || !this.byKey.has(st.key)) return false;
    const w = ctx.player.walker;
    return (w.x - st.x) * (w.x - st.x) + (w.z - st.z) * (w.z - st.z) <= (STATION_REACH + 1) * (STATION_REACH + 1);
  }

  private closed(why: ModalClose): void {
    const st = this.open;
    this.open = null;
    this.session.close();
    this.panel?.hide();
    this.robot = null;
    // (an empty pot that never began is no pot: the station is as it was)
    if (st?.pot && st.pot.phase === 'pick' && st.pot.items.length === 0) st.pot = null;
    void why;
  }

  /** the dice of cook_extra: the same journey, the same luck */
  private extraRoll(): boolean {
    this.plates++;
    const v = Math.sin((this.plates + 1) * 12.9898 + (this.ctx?.params.seed ?? 1) * 78.233) * 43758.5453;
    return v - Math.floor(v) < EXTRA_CHANCE;
  }

  /**
   * A dish is cooked: its servings into the hands (what does not fit at the feet), the recipe met and known in
   * the compendium, the skill's experience, one line.
   */
  private plated(dish: Dish, s: PotState): void {
    const ctx = this.ctx;
    const st = this.open;
    if (!ctx) return;
    const now = ctx.clock.worldSeconds;
    const one = dishItem(dish);
    const d = itemDef(one.item);
    // (a cook who keeps well: the dish starts going off only after it would have kept once already)
    const t0 = d.perish && progress.hasPerk(PERK_KEEP) ? now + d.perish.hours * 3600 : now;
    let atFeet = false;
    for (let left = dish.servings; left > 0; ) {
      const k = Math.min(left, d.stack ?? 1);
      left -= k;
      const item = newItem(one.item, { ...(k > 1 ? { n: k } : {}), q: one.q, state: { dish: { ...one.state.dish } }, ...(d.perish ? { t0 } : {}) });
      if (!intoHandsOrFeet(ctx, item)) atFeet = true;
    }
    let first = false;
    if (dish.recipe) {
      const times = (this.cooked.get(dish.recipe) ?? 0) + 1;
      this.cooked.set(dish.recipe, times);
      first = meet(ctx, COOK_DOMAIN, dish.recipe, 1, QUIET);
      learn(ctx, COOK_DOMAIN, dish.recipe, 'taste', QUIET);
    }
    ctx.events.emit('cooking:plated', { recipe: dish.recipe, name: dish.name.zh, servings: dish.servings, stars: dish.stars, station: st?.kind ?? 'kitchen' });
    ctx.sound('pickup', 0.4);
    const en = ctx.ui.lang === 'en';
    const name = en ? dish.name.en : dish.name.zh;
    const stars = '★'.repeat(dish.stars);
    const news = first ? (en ? ' · a new recipe' : ' · 新菜谱') : '';
    const feet = atFeet ? (en ? ` (${WORDS.atFeet.en})` : `（${WORDS.atFeet.zh}）`) : '';
    announce(ctx, `${name} ×${dish.servings} ${stars}${news}${feet}`, 2.4);
    const xp = (dish.recipe ? XP_RECIPE : XP_FREE) + XP_STAR * dish.stars;
    gainXp(ctx, COOK_SKILL_ID, xp * (first ? XP_FIRST : 1));
    void s;
  }

  // ---------------------------------------------------------------- eating, and the buffs

  /** something was eaten: a dish gives what it says; a buff begins */
  onAte(ctx: GameContext, item: ItemInstance): void {
    const d = item.state?.dish as DishState | undefined;
    if (!d) return;
    const body = ctx.body;
    eat(body, d.food, d.hp, d.sick === 2 ? 'sick2' : d.sick === 1 ? 'sick1' : undefined);
    if (d.water > 0) drink(body, 'water', d.water / 100);
    const cls = itemDef(item.item).tags?.find((t) => t !== 'dish') as DishClass | undefined;
    if (d.buff && d.buffS) this.grant(ctx, d.buff, d.buffS, cls === 'drink' ? 'drink' : 'meal', en(ctx) ? d.en : d.zh);
    else announce(ctx, en(ctx) ? `Ate the ${d.en}.` : `吃完了${d.zh}。`, 1.8);
  }

  /** a buff begins (a dish, the developer's hand): one line */
  grant(ctx: GameContext, id: BuffId, seconds: number, slot: 'meal' | 'drink', from?: string): void {
    const out = this.buffs.add(id, seconds, slot);
    ctx.events.emit('cooking:buff', { buff: id, seconds });
    const b = BUFFS[id];
    const min = Math.max(1, Math.round(seconds / 60));
    const gone = out ? (en(ctx) ? ` (${BUFFS[out].name.en} is gone)` : `（顶掉了${BUFFS[out].name.zh}）`) : '';
    if (en(ctx)) announce(ctx, `${from ? `${from} · ` : ''}${b.name.en} for ${min} min${gone}`, 2.4);
    else announce(ctx, `${from ? `${from} · ` : ''}${b.name.zh} ${min} 分钟${gone}`, 2.4);
  }

  /** the buffs that ran out in this step, each said in a line */
  private ranOut(ctx: GameContext): void {
    for (let i = 0; i < this.before.length; i++) {
      const id = this.before[i];
      if (!id || this.buffs.left(id) > 0) continue;
      announce(ctx, en(ctx) ? `${BUFFS[id].name.en} has worn off.` : `${BUFFS[id].name.zh}的劲儿过去了。`, 2);
    }
  }

  /** a recipe page in the hands is read: every recipe of its class is known */
  private readPages(ctx: GameContext): void {
    if (progressRev() === this.pagesAt) return;
    const slots = ctx.player.slots;
    for (let i = 0; i < slots.length; i++) {
      const h = slots[i];
      if (h?.kind !== 'item') continue;
      const cls = PAGE_CLASS.get(h.item.item);
      if (cls === undefined) continue;
      const ids = RECIPES.filter((r) => r.cls === cls).map((r) => r.id);
      const n = learnMany(ctx, COOK_DOMAIN, ids, 'page');
      if (n > 0) announce(ctx, en(ctx) ? `Read the page: ${n} recipes learnt.` : `看了看菜谱页：学会了 ${n} 道菜。`, 3);
    }
    this.pagesAt = progressRev();
  }

  // ---------------------------------------------------------------- the pickling jar

  /** the jars about: what is in them ripens with the hours, and with the road while they ride in a vehicle */
  private ripenJars(ctx: GameContext, dt: number): void {
    const now = ctx.clock.worldSeconds;
    const slots = ctx.player.slots;
    for (let i = 0; i < slots.length; i++) {
      const h = slots[i];
      if (h?.kind === 'item' && h.item.item === 'cook_jar') this.ripenJar(h.item, 0, now, dt);
    }
    const list = ctx.loose.list;
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (l.item?.item !== 'cook_jar') continue;
      const on = l.riding?.on as { sim?: { kmh: number } } | undefined;
      this.ripenJar(l.item, on?.sim ? Math.abs(on.sim.kmh) : 0, now, dt);
    }
  }

  private ripenJar(jar: ItemInstance, kmh: number, now: number, dt: number): void {
    const ins = jar.inside;
    let has = false;
    if (ins) for (let i = 0; i < ins.length && !has; i++) has = ingredient(ins[i].item) !== null;
    if (!has) {
      this.jars.delete(jar.uid);
      return;
    }
    let r = this.jars.get(jar.uid);
    if (!r) {
      r = { t: now, km: 0 };
      this.jars.set(jar.uid, r);
    }
    r.km += (kmh * dt) / 3600;
    if (now - r.t >= JAR_HOURS * 3600 || r.km >= JAR_KM) {
      this.pickle(jar, now);
      this.jars.delete(jar.uid);
    }
  }

  /** what is in a jar ripe: up to five portions of what goes into a pot become the 'pickle' dish, in the jar */
  pickle(jar: ItemInstance, now: number): Dish | null {
    const ins = jar.inside;
    if (!ins) return null;
    const portions: { item: string; q?: number; fresh?: 0 | 1 | 2 }[] = [];
    for (let i = 0; i < ins.length && portions.length < POT_MAX; i++) {
      const x = ins[i];
      if (!ingredient(x.item)) continue;
      const st = x.fresh === undefined ? 0 : freshStage(freshNow(x, now));
      if (st >= 3) continue;
      while (countOf(x) > 0 && portions.length < POT_MAX) {
        portions.push({ item: x.item, ...(x.q !== undefined ? { q: x.q } : {}), fresh: st >= 2 ? 2 : (st as 0 | 1) });
        if ((x.n ?? 1) > 1) x.n = (x.n ?? 1) - 1;
        else {
          x.n = 0;
          break;
        }
      }
    }
    for (let i = ins.length - 1; i >= 0; i--) if ((ins[i].n ?? 1) <= 0) ins.splice(i, 1);
    if (!portions.length) return null;
    const dish = cook('pickle', portions, { heat: 1, season: AUTO_SEASON }, 0);
    const one = dishItem(dish);
    ins.push(newItem(one.item, { ...(dish.servings > 1 ? { n: dish.servings } : {}), q: one.q, state: one.state }));
    if (!ins.length) delete jar.inside;
    return dish;
  }

  // ---------------------------------------------------------------- the save slice

  readonly slice: SaveSlice<CookingSaved> = {
    id: 'cooking',
    version: 1,
    snapshot: () => {
      const s: CookingSaved = {};
      const b = this.buffs.snapshot();
      if (b) s.b = b;
      if (this.cooked.size) s.n = Object.fromEntries(this.cooked);
      const pots: NonNullable<CookingSaved['pots']> = [];
      for (const st of this.stations) {
        if (!st.pot || !st.pot.items.length) continue;
        pots.push({ k: st.key, kind: st.kind, x: st.x, y: st.y, z: st.z, ...(st.fire > 0 ? { f: Math.round(st.fire) } : {}), s: JSON.parse(JSON.stringify(st.pot)) as PotState });
      }
      if (pots.length) s.pots = pots;
      if (this.jars.size) s.jars = [...this.jars].map(([u, r]) => ({ u, t: Math.round(r.t), km: Math.round(r.km * 100) / 100 }));
      return s.b || s.n || s.pots || s.jars ? s : undefined;
    },
    restore: (data) => {
      const d = (data && typeof data === 'object' ? data : {}) as Partial<CookingSaved>;
      this.buffs.restore(d.b);
      this.cooked.clear();
      if (d.n && typeof d.n === 'object') for (const [k, v] of Object.entries(d.n)) if (typeof v === 'number' && v > 0 && RECIPES.some((r) => r.id === k)) this.cooked.set(k, Math.floor(v));
      this.jars.clear();
      if (Array.isArray(d.jars)) for (const j of d.jars) if (j && typeof j.u === 'string' && Number.isFinite(j.t)) this.jars.set(j.u, { t: j.t, km: Number.isFinite(j.km) ? j.km : 0 });
      if (Array.isArray(d.pots)) {
        const uids: string[] = [];
        for (const p of d.pots) {
          const pot = soundPot(p?.s);
          if (!pot || typeof p.k !== 'string' || !STATION_NAME[p.kind] || ![p.x, p.y, p.z].every(Number.isFinite)) continue;
          for (const it of pot.items) forEachItem(it, (x) => uids.push(x.uid));
          const st = this.station(p.k, p.kind);
          st.x = p.x;
          st.y = p.y;
          st.z = p.z;
          st.fire = typeof p.f === 'number' ? p.f : 0;
          st.pot = pot;
        }
        reserveItemUids(uids);
      }
    },
    clear: () => {
      this.buffs.clear();
      this.cooked.clear();
      this.jars.clear();
      for (let i = this.stations.length - 1; i >= 0; i--) if (this.stations[i].kind !== 'kitchen') this.forget(this.stations[i]);
      for (const st of this.stations) st.pot = null;
    },
  };

  // ---------------------------------------------------------------- for the developer's tab and the scripts

  /** the station nearest where one stands, within `r` (null: none) */
  nearest(r = STATION_REACH + 1): Station | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const w = ctx.player.walker;
    let best: Station | null = null;
    let bd = r * r;
    for (const st of this.stations) {
      const d = (st.x - w.x) * (st.x - w.x) + (st.z - w.z) * (st.z - w.z);
      if (d <= bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** looked about now (a script that has just put a stove down, or stood by a fire) */
  lookNow(): void {
    if (this.ctx) this.lookAbout(this.ctx);
  }

  /**
   * A dish as if it had been cooked just now, at three stars or as given (the developer's "cook it now"): into
   * the hands, the recipe known, counted as cooked.
   */
  cookNow(recipeId: string, stars = 3): Dish | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const r = recipeById(recipeId);
    // the pot a recipe's needs ask for, of the first things that fill them
    const items: { item: string; q: number; fresh: 0 }[] = [];
    for (const need of r.need) {
      const fit = (i: ReturnType<typeof ingredient>): boolean => !!i && (need.item !== undefined ? i.item === need.item : need.tag !== undefined ? i.tags.includes(need.tag) : !!need.cls?.includes(i.cls));
      const one = need.item ?? ingredientsLike(fit);
      for (let k = 0; k < need.n; k++) if (one) items.push({ item: one, q: 3, fresh: 0 });
    }
    const q = stars >= 5 ? 5 : stars <= 1 ? 1 : Math.round(stars);
    const dish = cook(r.method, items, { heat: 1, knife: 1, season: 1 }, 15);
    // (the things chosen for a need of a class may make a more particular recipe: the dish is the one asked for)
    dish.recipe = r.id;
    dish.name = r.name;
    dish.cls = r.cls;
    dish.odd = false;
    dish.buff = r.buff;
    dish.buffS = Math.round(r.buffS * (0.55 + 0.15 * q));
    dish.stars = q;
    this.plated(dish, newPotState(r.method));
    return dish;
  }

  /** the robot cook set going at the station the panel is open at (opened at the nearest first) */
  startRobot(plan: RobotPlan, hands: RobotHands): boolean {
    if (!this.open) {
      const st = this.nearest();
      if (!st || !this.openAt(st)) return false;
    }
    const r = new RobotCook(this.session, plan, hands);
    this.robot = r;
    return r.start();
  }

  readonly harness = {
    /** the stations about: key, kind, where, what is cooking, the ways offered */
    stations: () => this.stations.map((st) => ({ key: st.key, kind: st.kind, x: st.x, y: st.y, z: st.z, fire: st.fire, methods: this.methodsAt(st), pot: st.pot ? { method: st.pot.method, phase: st.pot.phase, items: st.pot.items.map((i) => i.item), d: st.pot.pot.d, heat: st.pot.heat, lit: st.pot.lit, recipe: st.pot.recipe } : null })),
    look: () => this.lookNow(),
    /** open the panel at the nearest station (false: none within reach) */
    open: () => {
      const st = this.nearest();
      return st ? this.openAt(st) : false;
    },
    close: () => this.closePanel(),
    /** a key into the panel, as the keyboard's goes (through the modal) */
    key: (code: unknown) => (this.ctx ? this.ctx.modal.key(String(code)) : false),
    /** the panel as it stands: the phase, the pot, what it is, the steps */
    panel: () => {
      const s = this.session.state;
      const w = this.session.what();
      return { open: this.open?.key ?? null, phase: s?.phase ?? null, method: s?.method ?? null, items: s?.items.map((i) => i.item) ?? [], recipe: w.recipe?.id ?? null, name: w.name, odd: w.odd, known: w.recipe ? progress.knowledge(COOK_DOMAIN, w.recipe.id) === 2 : null, steps: this.session.steps(), d: s?.pot.d ?? 0, heat: s?.heat ?? 0, rows: this.session.rows.map((r) => `${r.item.item}×${r.item.n ?? 1}`), last: this.session.last ? { name: this.session.last.name.zh, stars: this.session.last.stars, recipe: this.session.last.recipe } : null };
    },
    robot: (plan: unknown, hands: unknown) => this.startRobot((plan ?? {}) as RobotPlan, { reaction: 0.4, error: 0.15, ...((hands ?? {}) as Partial<RobotHands>) }),
    robotReport: () => (this.robot ? { ...this.robot.report, dish: this.robot.report.dish ? { name: this.robot.report.dish.name.zh, recipe: this.robot.report.dish.recipe, stars: this.robot.report.dish.stars, servings: this.robot.report.dish.servings } : null } : null),
    buffs: () => {
      const out: { id: BuffId; left: number }[] = [];
      for (let i = 0; i < this.buffs.count; i++) out.push({ id: this.buffs.at(i), left: this.buffs.left(this.buffs.at(i)) });
      return out;
    },
    grant: (id: unknown, seconds: unknown) => {
      if (this.ctx && BUFFS[id as BuffId]) this.grant(this.ctx, id as BuffId, typeof seconds === 'number' ? seconds : 300, 'meal');
    },
    cookNow: (id: unknown, stars: unknown) => {
      const d = this.cookNow(String(id), typeof stars === 'number' ? stars : 3);
      return d ? { name: d.name.zh, recipe: d.recipe, stars: d.stars, servings: d.servings } : null;
    },
    cooked: () => Object.fromEntries(this.cooked),
    slice: () => this.slice.snapshot() ?? null,
    /** a jar ripened now (the scripts' and the tests' shortcut past 12 game hours) */
    ripen: () => {
      const ctx = this.ctx;
      if (!ctx) return 0;
      let n = 0;
      for (const h of ctx.player.slots) if (h?.kind === 'item' && h.item.item === 'cook_jar' && this.pickle(h.item, ctx.clock.worldSeconds)) n++;
      return n;
    },
  };
}

const QUIET = { quiet: true } as const;

function en(ctx: GameContext): boolean {
  return ctx.ui.lang === 'en';
}

/** the first ingredient that fills a need, by item id (the developer's "cook it now") */
function ingredientsLike(fit: (i: ReturnType<typeof ingredient>) => boolean): string | null {
  for (const r of RECIPES) for (const s of r.need) if (s.item && fit(ingredient(s.item))) return s.item;
  return null;
}

/** a pot read back from a save, made sound (null: nothing that can be cooked on) */
function soundPot(raw: unknown): PotState | null {
  const p = raw as Partial<PotState> | null;
  if (!p || typeof p !== 'object' || typeof p.method !== 'string' || !METHODS[p.method as Method] || !Array.isArray(p.items)) return null;
  const loss = { unknown: 0 };
  const items: ItemInstance[] = [];
  for (const it of p.items) {
    const c = cleanItem(it, loss);
    if (c && ingredient(c.item)) items.push(c);
  }
  const s = newPotState(p.method as Method);
  s.items = items;
  const phases = ['pick', 'knife', 'heat', 'season', 'wait', 'keep', 'plate'];
  s.phase = typeof p.phase === 'string' && phases.includes(p.phase) ? p.phase : 'pick';
  s.recipe = typeof p.recipe === 'string' && RECIPES.some((r) => r.id === p.recipe) ? p.recipe : null;
  s.knife = p.knife === true && !!s.recipe;
  s.season = p.season === true && !!s.recipe;
  const pot = p.pot ?? newPot(s.method);
  s.pot = { method: s.method, d: num(pot.d), sinceStir: num(pot.sinceStir), turned: pot.turned === true, t: num(pot.t), waited: num(pot.waited) };
  s.heat = p.heat === 1 || p.heat === 2 || p.heat === 3 ? p.heat : 0;
  s.lit = p.lit === true && METHOD_STEPS[s.method].cookS > 0;
  s.cuts = Array.isArray(p.cuts) ? p.cuts.filter((e) => typeof e === 'number' && e >= 0 && e <= 1) : [];
  if (Array.isArray(p.added)) for (let k = 0; k < 5; k++) s.added[k] = Math.max(0, Math.min(3, num(p.added[k])));
  s.auto = p.auto === true;
  s.keepFrom = keeps(s.method) && typeof p.keepFrom === 'number' && Number.isFinite(p.keepFrom) ? p.keepFrom : -1;
  s.most = Math.max(0, Math.min(4, Math.round(num(p.most))));
  if (!items.length) return null;
  return s;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** what is drawn of the panel (panel.ts) */
export interface CookPanelView {
  show(st: Station): void;
  hide(): void;
  update(dt: number): void;
  dispose(): void;
}

/** what is drawn of the stations: the fire, the pot and what is in it, steam, smoke (view.ts) */
export interface CookShow {
  update(dt: number, ctx: GameContext, c: Cooking): void;
  dispose(): void;
}

/** the buffs on screen (buffHud.ts) */
export interface BuffShow {
  update(dt: number, b: Buffs): void;
  dispose(): void;
}
