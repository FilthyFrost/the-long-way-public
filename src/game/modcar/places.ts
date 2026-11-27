/**
 * The places by the road in ModCar (docs/MODCAR.md §20, Arctic Drive's buildings): what one can do at them.
 *
 *  - Every container the world lays out (core/world/sites.ts: a kitchen's cupboard, a filling station's till, a
 *    garage's drawers and its shelves, a crate by the verge) has its things in it where one sees them (docs/V3/
 *    nodes/M3-loot.md): ModCar's own things by what it is and where it stands (core/modcar/loot.ts), laid out on its
 *    model's places for them (siteArt.ts ContainerSlot: a board of shelves, behind a cupboard's doors, in a drawer,
 *    under a lid, on a counter's top; core/modcar/containerLayout.ts), what fits nowhere on the floor before it.
 *    E opens and shuts what has doors, drawers or a lid; a thing in it is picked up as any thing lying about is
 *    (the mark on it, its card, E). What is left in it stays so, and it stays open or shut as one left it.
 *  - A filling station's pumps hold petrol and diesel: a jerrycan held to one fills from it (E), and with empty
 *    hands by a vehicle parked at it, E held fills the vehicle's tank (the pump's hum, its click when it is full).
 *  - The things lying in plain sight at a place are ModCar's: junk to recycle, a tyre, a jerrycan, food.
 *
 * Everything is there while one is within reach of the place and goes when one has gone on: what was taken or
 * moved, what was searched and taken out, how much is left in the pumps is kept (in the save too).
 */
import * as THREE from 'three';
import type { ContainerKind } from '../../core/items/loot';
import { itemDef, newItem, putInside, stackMax, stampFresh, type ItemInstance, type ItemState } from '../../core/modcar/items';
import { boxesOfFinds, CONTAINER_MATERIAL, CONTAINER_NAMES, foundKey, foundScheduled, insideFound, looseFound, looseKept, lootRules, ownFound, planBoxes, planGround, stationFuel, type Climate, type Found, type LootRules } from '../../core/modcar/loot';
import { pumpInto, tankRoomOf, type FuelTank, type Tool } from '../../core/modcar/tools';
import type { FuelType, PartInstance, Text } from '../../core/modcar/types';
import type { Site, SiteContainer, SiteObject } from '../../core/world/sites';
import { fitToPlaces, heldBackUntil, placesPlan, scheduleOf, SitePlanner, THEME_WAIT_M, type PlannedFind, type PlanPlace, type ScheduledThing } from '../../core/modcar/schedule';
import { CHAPTER_KM } from '../../core/modcar/crafting';
import type { Difficulty } from '../../core/modcar/difficulty';
import { lookAheadFinds, regionsAlong } from '../../core/modcar/lookahead';
import { supplyCount, type Stocks } from '../../core/modcar/needs';
import type { World } from '../../core/world/terrain';
import type { GarageDevice } from './garageStub';
import { FUEL_ZH, type ItemCard } from './itemInfo';
import { itemNow } from './itemTime';
import { layOut, type LayoutRoom, type LayoutThing, type LayoutWay } from '../../core/modcar/containerLayout';
import { lieBox, type Lie, type ThingBox } from '../../core/modcar/cargo';
import type { Carrier, Loose, LooseThings } from './loose';
import type { Held, TankPort } from './player';
import type { ContainerSlot } from './siteArt';
import type { ModVehicle } from './vehicle';
import type { Workshop, WorkshopSave } from './workshop';

/** a place's things are there within this of its middle (and its reach) */
const NEAR = 80;
/** and go once one is this far off */
const FAR = 190;
/** how often the places about are looked over (s) */
const CHECK_EVERY = 0.5;
/** a pump's flow into a vehicle (L/s) */
const PUMP_RATE = 2.5;
/** a vehicle parked at a pump: its body within this of the pump (m) */
const PUMP_REACH = 4.5;

/** what each sort of place is called (on a card's line over the name) */
const PLACE_ZH: Record<string, string> = { station: '加油站', garage: '修车铺', shop: '商店', house: '民房', motel: '汽车旅馆', camp: '营地', jetty: '码头', hide: '猎人的地方', lookout: '瞭望台', lighthouse: '灯塔', works: '工厂', roadside: '路边' };

/** a container's line on its card */
const BLURB: Partial<Record<ContainerKind, string>> = {
  crate: '一只旧木箱，钉子都锈了。',
  toolbox: '红色的工具车，抽屉里什么都可能有。',
  shelf: '货架上还剩些没人拿走的东西。',
  counter: '柜台后面的抽屉、收银机旁边。',
  cupboard: '厨房的碗柜。',
  wardrobe: '衣柜里挂着几件旧衣服。',
  desk: '书桌的抽屉。',
  medicine: '药柜。',
  barrel: '一只锈铁桶，里面塞着些杂物。',
  fridge: '早就没电了，门一直关着，里面的东西还没坏。',
  coolbox: '谁留在这儿的保温箱。',
  tacklebox: '谁的钓具箱。',
  gamebag: '猎人留下的包。',
  garage: '修车铺的零件架。',
};

/** a thing as a save keeps it */
export type SavedThing = { item?: ItemInstance; tool?: Tool; part?: PartInstance };

export interface PlacesSave {
  /** the containers opened at some time */
  searched: string[];
  /** the containers open now (left so: absent in an older save, the ones searched, which were left open) */
  open?: string[];
  /** the buildings' doors one opened or shut (doors.ts) */
  doors?: Record<string, 0 | 1>;
  /** what is left in those something was taken out of */
  left: Record<string, SavedThing[]>;
  /** the pumps' litres left, by the station's tank */
  pumps: Record<string, { petrol: number; diesel: number }>;
  /** the things in plain sight taken or moved (by their id) */
  taken: string[];
  /** the roadside garages' machines (their generators' fuel, whether they run, a thing on the bench), by the site */
  shops?: Record<string, WorkshopSave>;
}

/**
 * A found thing as it comes into the world: an item is made here, as the stack, of the quality and with the
 * state its Found says (none of them: one plain thing), and its freshness starts counting now.
 */
/** how far down a world of version 7's road its places are looked over when its plan is made (m): the plan fitted to them, what the road ahead asks for */
export const LOOK_TO_M = 300_000;

/**
 * The plan of what turns up down a world's road, as the game lays it over its places (the robot traveller's too): the
 * plan of its version (schedule.ts scheduleOf) at the difficulty — and, a world of version 7 on, fitted to its places
 * (each chapter's new thing within its chapter whatever the road is like there: fitToPlaces) with what the road ahead
 * asks for (a coat before the snow, water before the desert, petrol before a long way with no place: lookahead.ts).
 * The world's places and regions down its first LOOK_TO_M are looked over once for it.
 */
export function worldPlan(world: World, seed: number, difficulty: Difficulty = 'normal', toKm = 4000): PlannedFind[] {
  const version = world.rules.version;
  const finds = placesPlan(seed, toKm, difficulty, scheduleOf(version));
  if (version < 7) return finds;
  const to = Math.min(LOOK_TO_M, toKm * 1000);
  const places = planPlaces(world, 0, to);
  return [...fitToPlaces(finds, places), ...lookAheadFinds(seed, regionsAlong(world.spine.plan, to), places, CHAPTER_KM[2] * 1000)].sort((a, b) => a.s - b.s);
}

/**
 * A world's places as the plan sees them (schedule.ts PlanPlace), between two points of its road (m; both ends
 * counted), in road order — those and no others (the world hands its places out by the stretch: the ones of the
 * stretches at either end that lie outside are left out)
 */
export function planPlaces(world: World, from: number, to: number): (PlanPlace & { id: string })[] {
  const sites: Site[] = [];
  world.sites.between(from, to, sites);
  return sites
    .filter((x) => x.s >= from && x.s <= to)
    .sort((a, b) => a.s - b.s)
    .map((x) => ({ id: x.id, s: x.s, kind: x.sort, boxes: planBoxes(x).length, ground: planGround(x) }));
}

/**
 * Is a place one the game brings its things to as one comes near: every place but a bare verge — and a verge is not
 * bare that has a box, a thing lying on it, or a wreck by whose door the plan's finds are laid (loot.ts planGround: a
 * wreck stripped long ago has neither box nor thing of its own, and the plan may still have put a can of petrol or a
 * part of the car one started with on the ground by it)
 */
export function comesAlive(site: Site): boolean {
  return site.kind !== 'roadside' || site.containers.length > 0 || site.loose.length > 0 || planGround(site);
}

export function heldOfFound(f: Found): NonNullable<Held> {
  if ('item' in f) {
    const o: Partial<ItemInstance> = {};
    // (never more than its kind stacks to: one instance is one stack)
    if (f.n !== undefined && f.n > 1) {
      const n = Math.min(Math.floor(f.n), stackMax(f.item));
      if (n > 1) o.n = n;
    }
    if (f.q !== undefined) o.q = f.q;
    // (its own copy: no two things share one state)
    if (f.state !== undefined) o.state = JSON.parse(JSON.stringify(f.state)) as ItemState;
    const item = newItem(f.item, o);
    stampFresh(item, itemNow());
    return { kind: 'item', item };
  }
  if ('tool' in f) return { kind: 'tool', tool: f.tool };
  return { kind: 'part', inst: f.part };
}

export function savedOf(h: NonNullable<Held>): SavedThing {
  return h.kind === 'item' ? { item: h.item } : h.kind === 'tool' ? { tool: h.tool } : { part: h.inst };
}

export function heldOfSaved(s: SavedThing): Held {
  return s.item ? { kind: 'item', item: s.item } : s.tool ? { kind: 'tool', tool: s.tool } : s.part ? { kind: 'part', inst: s.part } : null;
}

/** a container at a place, as the hands know it */
export class PlaceContainer {
  readonly kind = 'container' as const;
  /** what is in it (known as it comes: its things lie in it) */
  contents: NonNullable<Held>[] | null = null;
  /** its things lying in it now, the places' own (none until they are laid out) */
  readonly things: Loose[] = [];
  /** they are laid out (or being: their models coming in) */
  laid = false;
  laying = false;
  /** where they lie (its model's places for them, as drawn), for the shut ones' sake */
  slots: readonly ContainerSlot[] = [];
  /** goes up whenever what is in it changes (the list of it builds its rows again only then) */
  rev = 0;
  constructor(
    readonly c: SiteContainer,
    readonly site: Site,
    readonly name: string,
  ) {}

  get id(): string {
    return this.c.id;
  }

  get searched(): boolean {
    return this.contents !== null;
  }
}

/** a thing of a container's lying in it: which container, and which of what is in it */
interface InContainer {
  pc: PlaceContainer;
  h: NonNullable<Held>;
}

/** the box of a thing whose model is not in (about the size of most things) */
const ROUGH: ThingBox = { minX: -0.15, maxX: 0.15, minY: 0, maxY: 0.3, minZ: -0.15, maxZ: 0.15 };

/** the ways a thing may lie in a container, the wanted first: standing, turned a quarter, on its side (two ways), each turned */
const WAYS: readonly { turn: boolean; lie?: Lie }[] = [{ turn: false }, { turn: true }, { turn: false, lie: 'z' }, { turn: true, lie: 'z' }, { turn: false, lie: 'x' }, { turn: true, lie: 'x' }];

/** a thing's size each of those ways */
function waysOf(b: ThingBox): LayoutWay[] {
  return WAYS.map((w) => {
    const lb = lieBox(b, w.lie);
    const across = lb.maxZ - lb.minZ;
    const deep = lb.maxX - lb.minX;
    return w.turn ? { w: deep, d: across, h: lb.maxY - lb.minY } : { w: across, d: deep, h: lb.maxY - lb.minY };
  });
}

const Y_UP = new THREE.Vector3(0, 1, 0);
const LIE_Z = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
const LIE_X = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function isContainer(x: unknown): x is PlaceContainer {
  return x instanceof PlaceContainer;
}

/** what the places need of the game */
export interface PlacesHost {
  readonly world: World | null;
  readonly origin: { x: number; y: number; z: number };
  readonly loose: LooseThings;
  readonly vehicles: readonly ModVehicle[];
  /** a sound (foley.ts) by name, with its options, so many seconds from now */
  play(name: string, opts?: Record<string, unknown>, delay?: number): void;
  /** sounds rendered before they are wanted */
  warm?(name: string, opts?: Record<string, unknown>): void;
  /** a loop kept going this frame */
  loop(name: string, opts?: Record<string, unknown>): void;
  say(text: string, seconds?: number): void;
  /** the list of what is in a container, opened */
  openContainer(pc: PlaceContainer): void;
  /** fuel went into a vehicle */
  fuelled(v: ModVehicle): void;
  /** a container's doors, drawers or lid opening as it is searched (drawn: siteArt.ts) */
  opened?(id: string): void;
  /** … opening or shutting (docs/V3/nodes/M3-loot.md) */
  setOpen?(id: string, open: boolean): void;
  /** has the container doors, drawers or a lid (null: its place is not drawn yet) */
  movesOf?(id: string, site: string): boolean | null;
  /** where a container's things lie (null: its place is not drawn yet; absent: nothing draws them — on its top) */
  slots?(id: string, site: string): readonly ContainerSlot[] | null;
  /** a thing's box once its model is in (cargo.ts measured) */
  measure?(h: NonNullable<Held>): Promise<ThingBox | null>;
  /** a roadside garage's machines, made as one comes (null: it has no room for them) and taken away as one goes */
  makeWorkshop?(site: Site, save?: WorkshopSave): Workshop | null;
  dropWorkshop?(ws: Workshop): void;
  /** the plan of what turns up down the road (schedule.ts plan: the world's seed, the difficulty); absent: none */
  planned?(): readonly PlannedFind[] | null;
  /**
   * the sheet one of the plan's blueprint places has for one who comes to it now (docs/V3/plan/finish.md §六 2: the next
   * not learnt yet, of chapter `chapter` or before) — `slot` the place's own key, `s` how far down the road it is (m);
   * `want` the sheet the plan names for it (the motorcycle rack's after the motorcycle: that one unless it is learnt
   * already); absent: the first sheet of its chapter (loot.ts foundScheduled)
   */
  blueprintAt?(slot: string, chapter: number, s: number, want?: string): ScheduledThing;
  /** the finds added to the plan since the game began (a set's steps, put out as it went: kits.ts) — a new planner takes them all; absent: none */
  added?(): readonly PlannedFind[];
  /** is this thing kept back for now (a piece of a set whose main thing has not been picked up: kits.ts kitHeld)? Its key: an item's id, `part:` and a part's */
  withheld?(key: string): boolean;
  /** has the set this thing begins been begun already (another of it is one too many: the place has something else)? */
  begun?(key: string): boolean;
  /** what the road is like at a point of it and a little way on (core/modcar/lookahead.ts climateAhead): what a wardrobe there holds goes with it; absent: mild */
  climate?(s: number): Climate;
  /**
   * How the supply of each thing one lives on is scaled by how much of it one has now (core/modcar/needs.ts
   * supplyFactors: 0.7–1.4) — asked as a place's boxes are laid out; absent: nothing is (a world made before version 7)
   */
  supply?(): Stocks | undefined;
  /** how much of the places' own food, drink, petrol and oil is still there (0–1; absent: all of it) */
  keep?(): number;
  /** the parts lying beside the vehicles to find at a place (wrecks.ts besideAt); absent: none */
  besideOf?(site: Site): readonly { id: string; inst: PartInstance; x: number; z: number; yaw: number }[];
}

/** a place there now: its containers and pumps as the hands know them, its things in plain sight */
interface LivePlace {
  site: Site;
  containers: PlaceContainer[];
  devices: GarageDevice[];
  ports: TankPort[];
  /** its things in plain sight there now (their ids), and where each was put */
  loose: Map<string, { l: Loose; x: number; y: number; z: number }>;
  /** a roadside garage's machines (its bench, its recycler, its generator) */
  workshop: Workshop | null;
}

const tmpBox = new THREE.Box3();
const tmpM = new THREE.Matrix4();
const tmpInv = new THREE.Matrix4();
const tmpRay = new THREE.Ray();
const tmpHit = new THREE.Vector3();

/**
 * Where along a ray (render space) it meets an upright box turned by yaw (world: centre of its base, half
 * sizes, height), null if it misses or is further than reach
 */
function boxHit(ray: THREE.Ray, o: { x: number; y: number; z: number }, x: number, y: number, z: number, yaw: number, hx: number, h: number, hz: number, reach: number): number | null {
  // (the box's frame: along (cos yaw, sin yaw), across, up — the sites' convention)
  tmpM.makeRotationY(-yaw).setPosition(x - o.x, y - o.y, z - o.z);
  tmpInv.copy(tmpM).invert();
  tmpRay.copy(ray).applyMatrix4(tmpInv);
  tmpBox.min.set(-hx, 0, -hz);
  tmpBox.max.set(hx, h, hz);
  const p = tmpRay.intersectBox(tmpBox, tmpHit);
  if (!p) return null;
  const d = p.distanceTo(tmpRay.origin);
  return d <= reach ? d : null;
}

export class Places {
  private readonly live = new Map<string, LivePlace>();
  private readonly searched = new Set<string>();
  private readonly left = new Map<string, SavedThing[]>();
  private readonly pumps = new Map<string, { petrol: number; diesel: number }>();
  private readonly taken = new Set<string>();
  private readonly shops = new Map<string, WorkshopSave>();
  private checkT = 0;
  private readonly sites: Site[] = [];
  /** the devices and tanks of the places there now, gathered (rebuilt when a place comes or goes) */
  devices: GarageDevice[] = [];
  ports: TankPort[] = [];
  /** the loose things that are the places' own (not yet taken or moved): not saved with the game's own */
  private readonly owned = new Map<Loose, { site: string; id: string }>();
  /** the things lying in the containers, the places' own while they lie there */
  private readonly inside = new Map<Loose, InContainer>();
  /** the containers open now (drawn so, and their things reached) */
  private readonly openNow = new Set<string>();
  /** the things lying about were last looked over at this revision of them (LooseThings.rev) */
  private insideRev = -1;
  /** the things lying in a container's shut part (behind its doors, in a drawer, under its lid) */
  private readonly inShut = new WeakSet<Loose>();
  /** the things lying on a counter's keeper's side, by the place they lie in (reached only from behind it) */
  private readonly behind = new Map<Loose, ContainerSlot>();
  private readonly bp = new THREE.Vector3();
  /** the carriers a drawer's things ride (by the marker in it) */
  private readonly drawers = new Map<THREE.Object3D, Carrier>();
  /** a pump filling a vehicle: how much it was to take when the hold began, how much has gone in */
  private fill: { dev: string; need: number; given: number; p: number } | null = null;
  /** the pump whose nozzle is out (in a vehicle's filler), until when (the places' clock): drawn by siteArt.ts */
  private nozzleOut: { site: string; obj: number; v: ModVehicle; until: number } | null = null;
  private clock = 0;
  /** the container being searched (its opening heard once a hold) and how far */
  private searching = { id: '', p: 0 };
  /** the container sounds rendered already, by material */
  private readonly warmed = new Set<string>();

  constructor(
    private readonly host: PlacesHost,
    save?: PlacesSave,
  ) {
    if (save) {
      for (const id of save.searched ?? []) this.searched.add(id);
      // (an older save: what was searched was left open)
      for (const id of save.open ?? save.searched ?? []) this.openNow.add(id);
      for (const [id, l] of Object.entries(save.left ?? {})) this.left.set(id, l);
      for (const [id, p] of Object.entries(save.pumps ?? {})) this.pumps.set(id, p);
      for (const id of save.taken ?? []) this.taken.add(id);
      for (const [id, w] of Object.entries(save.shops ?? {})) this.shops.set(id, w);
    }
  }

  /** the roadside garages' machines there now */
  get workshops(): Workshop[] {
    const out: Workshop[] = [];
    for (const lp of this.live.values()) if (lp.workshop) out.push(lp.workshop);
    return out;
  }

  /**
   * Is it one of the places' own things lying about: not yet taken, moved or changed where it lies? Asked as
   * the game is saved (a place's own things are not saved with the things lying about: the place makes them
   * again), so it is settled here and now, not at the next frame: a thing let go is saved from this very save on.
   */
  owns(l: Loose): boolean {
    // (a thing lying in a container is the container's: what is left in it is kept with the container)
    if (this.inside.has(l)) {
      this.lookInside();
      if (this.inside.has(l)) return true;
    }
    const o = this.owned.get(l);
    return !!o && !this.letGo(l, o);
  }

  /** is this container open now? (siteArt.ts draws it so) */
  isOpen(id: string): boolean {
    return this.openNow.has(id);
  }

  /**
   * The containers' things looked over (when the things lying about have changed): one picked up is out of its
   * container, which keeps what is left in it from then on; one changed where it lies (some taken off its stack)
   * is kept as it is now.
   */
  private lookInside(): void {
    const L = this.host.loose;
    if (L.rev === this.insideRev) return;
    this.insideRev = L.rev;
    for (const [l, o] of this.inside) {
      const pc = o.pc;
      if (!L.list.includes(l)) {
        this.inside.delete(l);
        const i = pc.things.indexOf(l);
        if (i >= 0) pc.things.splice(i, 1);
        const k = pc.contents?.indexOf(o.h) ?? -1;
        if (k >= 0) pc.contents!.splice(k, 1);
        this.kept(pc);
        continue;
      }
      if (l.touched) {
        l.touched = false;
        this.kept(pc);
      }
    }
  }

  /**
   * A thing of a place's that was picked up, moved, or has changed where it lies (some taken off its stack, a
   * thing put into it or taken out of it: LooseThings.touch) is one's own from then on: its id is kept as
   * taken, so that the place never makes it again, and it is saved with the things lying about. True when it
   * is let go (now); false: it is the place's still.
   */
  private letGo(l: Loose, o: { site: string; id: string }): boolean {
    const lp = this.live.get(o.site);
    const at = lp?.loose.get(o.id);
    // (moved: more than a quarter of a metre from where the place put it; squared, so that nothing is handed to a function and put on the heap every frame)
    const moved = !!at && (l.x - at.x) * (l.x - at.x) + (l.z - at.z) * (l.z - at.z) > 0.25 * 0.25;
    if (this.host.loose.list.includes(l) && !l.touched && !moved) return false;
    this.taken.add(o.id);
    this.owned.delete(l);
    lp?.loose.delete(o.id);
    return true;
  }

  /** every frame: the places within reach of (x, z) there, the ones left behind gone */
  update(dt: number, x: number, z: number): void {
    this.clock += dt;
    if (this.nozzleOut && this.clock > this.nozzleOut.until) this.nozzleOut = null;
    const world = this.host.world;
    if (!world) return;
    // (a thing of a place's picked up, moved or changed where it lies: one's own from then on)
    for (const [l, o] of this.owned) this.letGo(l, o);
    this.lookInside();
    // (what lies on a counter's keeper's side is reached from behind it: from in front one sees only the counter)
    for (const [l, s] of this.behind) {
      if (!this.inside.has(l)) {
        this.behind.delete(l);
        continue;
      }
      const e = s.frame.matrixWorld.elements;
      const o = this.host.origin;
      this.bp.set(x - (e[12] + o.x), 0, z - (e[14] + o.z));
      l.shut = this.bp.x * e[0] + this.bp.z * e[2] > 0;
    }
    if ((this.checkT -= dt) > 0) return;
    this.checkT = CHECK_EVERY;
    // the containers whose things are not laid out yet: once their places are drawn
    for (const lp of this.live.values()) for (const pc of lp.containers) if (!pc.laid && !pc.laying) this.layOutIn(lp, pc);
    const s = world.spine.sAtX(x);
    this.sites.length = 0;
    world.sites.between(s - FAR - 300, s + FAR + 300, this.sites);
    let changed = false;
    for (const site of this.sites) {
      if (!comesAlive(site)) continue;
      const d = Math.hypot(site.x - x, site.z - z) - site.reach;
      if (d < NEAR && !this.live.has(site.id)) {
        this.come(site);
        changed = true;
      }
    }
    for (const [id, lp] of [...this.live]) {
      if (Math.hypot(lp.site.x - x, lp.site.z - z) - lp.site.reach > FAR) {
        this.go(id, lp);
        changed = true;
      }
    }
    if (changed) {
      this.devices = [...this.live.values()].flatMap((lp) => [...lp.devices, ...(lp.workshop?.devices ?? [])]);
      this.ports = [...this.live.values()].flatMap((lp) => [...lp.ports, ...(lp.workshop?.tanks ?? [])]);
    }
  }

  // ------------------------------------------------------------------ a place comes and goes

  private come(site: Site): void {
    const lp: LivePlace = { site, containers: [], devices: [], ports: [], loose: new Map(), workshop: null };
    this.live.set(site.id, lp);
    // a roadside garage: a bench, a recycler and a generator of its own (Arctic Drive's outposts): made and recycled on the road
    if (site.kind === 'garage') lp.workshop = this.host.makeWorkshop?.(site, this.shops.get(site.id)) ?? null;
    for (const c of site.containers) {
      // (a wreck's glovebox and boot are the wreck's own: wrecks.ts)
      if (c.kind === 'glovebox' || c.kind === 'boot') continue;
      // (its sounds rendered before they are wanted)
      const mat = CONTAINER_MATERIAL[c.kind];
      if (!this.warmed.has(mat)) {
        this.warmed.add(mat);
        for (const n of ['container_open', 'rummage', 'container_empty']) this.host.warm?.(n, { material: mat });
      }
      const pc = new PlaceContainer(c, site, CONTAINER_NAMES[c.kind] ?? '箱子');
      const kept = this.left.get(c.id);
      // (what is in it, there before anyone looks: the same every visit, or as one left it)
      pc.contents = kept ? kept.map(heldOfSaved).filter((h): h is NonNullable<Held> => !!h) : this.roll(pc);
      lp.containers.push(pc);
      lp.devices.push(this.containerDevice(pc));
      this.layOutIn(lp, pc);
    }
    // a filling station's pumps: one petrol, the next diesel …
    const tank = site.fuel.find((f) => f.from === 'tank');
    if (site.kind === 'station' && tank) {
      const st = this.pumps.get(tank.id) ?? stationFuel(tank.litres, site.seed);
      this.pumps.set(tank.id, st);
      let i = 0;
      for (const o of site.objects) {
        if (o.kind !== 'pump') continue;
        const fuel: FuelType = i % 2 === 0 ? 'petrol' : 'diesel';
        lp.ports.push(this.pumpPort(site, o, i, fuel, st));
        lp.devices.push(this.pumpDevice(site, o, i, fuel, st));
        i++;
      }
    }
    // the things in plain sight
    const held = this.heldBack();
    for (const t of site.loose) {
      if (this.taken.has(t.id)) continue;
      // (one of the new things not yet: the plan gives its first — at the first place of its sort within THEME_WAIT_M of
      // where it is due — a building's own wait for it: docs/V3/plan/growth.md §六 3)
      const until = held.get(t.item);
      if (until !== undefined && site.s < until + THEME_WAIT_M) continue;
      const f = looseFound(t.item, hashId(t.id), site.s, site.sort, this.rules(), this.host.climate?.(site.s) ?? 'mild');
      if (!f || !looseKept(f, hashId(t.id), this.keep(), this.host.supply?.())) continue;
      // (a world of version 7: by what it is found to be — a spray can, a car radio wait for the plan's first too)
      if (this.heldNow(foundKey(f), site.s)) continue;
      // (a piece of a set whose main thing has not been picked up yet: not yet)
      if (this.host.withheld?.(foundKey(f))) continue;
      const h = heldOfFound(f);
      // (a world of version 7: what a piece of the place's furniture holds inside — a motel's nightstand, its drawer's small things)
      if (h.kind === 'item') this.fillInside(h.item, t.id, site);
      const L = this.host.loose;
      const l = h.kind === 'part' ? L.addPart(h.inst, t.x, t.y, t.z, t.yaw) : h.kind === 'tool' ? L.addTool(h.tool, t.x, t.y, t.z, t.yaw) : L.addItem(h.item, t.x, t.y, t.z, t.yaw);
      // (it lies where it lies: on the ground — as it is drawn — on a counter, on a pump; its lowest point on it, whatever its model's origin)
      const ground = typeof this.host.world?.heightAt === 'function' ? this.host.world.heightAt(t.x, t.z) : t.y;
      L.seat(l, t.y, Math.abs(t.y - ground) < 0.06);
      lp.loose.set(t.id, { l, x: t.x, y: t.y, z: t.z });
      this.owned.set(l, { site: site.id, id: t.id });
    }
    // the plan's finds where there is no box of the place's own for them
    this.layByWreck(site, lp);
    // the parts beside a vehicle to find, on the ground
    this.layBeside(site, lp);
  }

  /**
   * What a piece of furniture of a place's own holds inside as it is laid (loot.ts insideFound: by the piece, the sort
   * of place and the thing's own seed — the same every visit; none in a world made before version 7): put into it,
   * the piece's while the piece is the place's. Opened (its drawer pulled out: the furniture's system touches it), the
   * piece is one's own from then on with what is in it, and kept with the game.
   */
  private fillInside(box: ItemInstance, id: string, site: Site): void {
    if (!itemDef(box.item).holds) return;
    const found = insideFound(box.item, site.sort, hashId(id), site.s, this.rules(), this.keep(), (key) => this.heldNow(key, site.s) || (this.host.withheld?.(key) ?? false), this.host.supply?.());
    for (const f of found ?? []) {
      const h = heldOfFound(f);
      if (h.kind === 'item') putInside(box, h.item, itemNow());
    }
  }

  /** the parts lying beside the vehicles to find here (the place's own: gone for good once picked up, as what lies about) */
  private layBeside(site: Site, lp: LivePlace): void {
    const world = this.host.world;
    if (!world || typeof world.heightAt !== 'function') return;
    for (const p of this.host.besideOf?.(site) ?? []) {
      if (this.taken.has(p.id)) continue;
      const y = world.heightAt(p.x, p.z);
      const l = this.host.loose.addPart(p.inst, p.x, y, p.z, p.yaw);
      this.host.loose.seat(l, y, true);
      lp.loose.set(p.id, { l, x: p.x, y, z: p.z });
      this.owned.set(l, { site: site.id, id: p.id });
    }
  }

  private go(id: string, lp: LivePlace): void {
    if (lp.workshop) {
      this.shops.set(id, lp.workshop.snapshot());
      this.host.dropWorkshop?.(lp.workshop);
      lp.workshop = null;
    }
    // (what is the place's still goes with it; what was taken, moved or changed was let go as this frame began: update)
    for (const [, t] of lp.loose) {
      if (!this.owned.has(t.l)) continue;
      this.owned.delete(t.l);
      this.host.loose.remove(t.l);
    }
    // (and what lies in its containers: kept as it is, laid out again at the next visit)
    this.lookInside();
    for (const pc of lp.containers) {
      for (const l of pc.things) {
        if (!this.inside.has(l)) continue;
        this.inside.delete(l);
        this.host.loose.remove(l);
      }
      pc.things.length = 0;
      pc.laid = false;
    }
    for (const [mk] of this.drawers) if (!mk.parent) this.drawers.delete(mk);
    this.live.delete(id);
  }

  /** what a container holds, rolled (the same every time) — and what of the plan its place holds (docs/V3/plan/growth.md §六 3) */
  private roll(pc: PlaceContainer): NonNullable<Held>[] {
    // (the place's own: what is still there of it — the food and the drink mostly gone, J10; a prefab's box for the plan has none of its own: loot.ts ownRoll)
    // (a piece of a set whose main thing has not been picked up yet is not there: docs/V3/plan/finish.md §二 3)
    // (… nor, in a world of version 7, a new thing of the plan's before its first is due: nothing of a chapter before it)
    // (and more or less of what one lives on by what one is short of as one comes: needs.ts)
    const factors = this.host.supply?.();
    const own = ownFound(pc.c, pc.site.s, pc.site.sort, this.rules(), this.host.climate?.(pc.site.s) ?? 'mild', this.keep(), (key) => this.heldNow(key, pc.site.s) || (this.host.withheld?.(key) ?? false), factors).map(heldOfFound);
    // (a place's finds shared among its own boxes, each in the one with the most room for it: the same way every time)
    const finds = this.findsOf(pc.site);
    if (!finds.length) return own;
    const i = planBoxes(pc.site).indexOf(pc.c);
    const into = this.findBoxes.get(pc.site.id) ?? boxesOfFinds(pc.site, finds, this.rules());
    this.findBoxes.set(pc.site.id, into);
    finds.forEach((f, k) => {
      if (into[k] !== i) return;
      // (a supply of the plan's: none of it, or two, now and then — by what one is short of)
      const n = factors ? supplyCount(f, factors, pc.c.seed + k * 31) : 1;
      for (let c = 0; c < n; c++) [f.thing, ...(f.with ?? [])].forEach((t, j) => own.push(heldOfFound(foundScheduled(this.sheetOf(t, `${pc.site.id}/plan${k}.${j}`, pc.site.s), pc.c.seed + k * 31 + j + c * 977, pc.site.s, this.rules()))));
    });
    return own;
  }

  /** a planned thing as it is found: a blueprint's place has the sheet the game says it has now (the host's blueprintAt), anything else is itself */
  private sheetOf(t: ScheduledThing, slot: string, s: number): ScheduledThing {
    if ('blueprint' in t) return this.host.blueprintAt?.(slot, t.blueprint, s) ?? t;
    // (the main thing of a set one has begun already: a box of old components in its place)
    if (this.host.begun?.('item' in t ? t.item : 'part' in t ? `part:${t.part}` : '')) return { item: 'crate_parts' };
    // (a sheet the plan names: not one learnt already)
    if ('item' in t && t.item.startsWith('bp_')) return this.host.blueprintAt?.(slot, 0, s, t.item) ?? t;
    return t;
  }

  /** what of the plan a place holds (docs/V3/plan/growth.md §六 3): the places down to it taken in first, in road order */
  private findsOf(site: Site): readonly PlannedFind[] {
    const planner = this.planner();
    if (!planner) return [];
    if (planner.through < site.s && this.host.world) {
      planner.take(planPlaces(this.host.world, Math.max(0, planner.through - 1), site.s + 1));
    }
    return planner.findsAt(site.id);
  }

  /**
   * The plan's finds at a place with no box of its own for them but a wreck by the road (its glovebox and boot are the
   * wreck's): on the ground by the wreck's door, one beside another — a can of petrol left by a wreck. Picked up, they
   * are gone from it for good, as what lies about is.
   */
  private layByWreck(site: Site, lp: LivePlace): void {
    if (planBoxes(site).length) return;
    const car = site.objects.find((o) => o.kind === 'wreck');
    const finds = car ? this.findsOf(site) : [];
    if (!car || !finds.length || typeof this.host.world?.heightAt !== 'function') return;
    const c = Math.cos(car.yaw);
    const s = Math.sin(car.yaw);
    let n = 0;
    finds.forEach((f, k) =>
      [f.thing, ...(f.with ?? [])].forEach((t, j) => {
        const id = `${site.id}/plan${k}.${j}`;
        const along = -0.5 + 0.65 * n++;
        if (this.taken.has(id)) return;
        // (by its door: out of its left side, the cab's end of it)
        const x = car.x + c * along + s * (car.d / 2 + 0.75);
        const z = car.z + s * along - c * (car.d / 2 + 0.75);
        const y = this.host.world!.heightAt(x, z);
        const h = heldOfFound(foundScheduled(this.sheetOf(t, id, site.s), site.seed + k * 31 + j, site.s, this.rules()));
        const L = this.host.loose;
        const l = h.kind === 'part' ? L.addPart(h.inst, x, y, z, car.yaw) : h.kind === 'tool' ? L.addTool(h.tool, x, y, z, car.yaw) : L.addItem(h.item, x, y, z, car.yaw);
        L.seat(l, y, true);
        lp.loose.set(id, { l, x, y, z });
        this.owned.set(l, { site: site.id, id });
      }),
    );
  }

  /** the rules of what is found, by the world's version (loot.ts: a world of version 7's own; with no world, as it always was) */
  private rules(): LootRules {
    return lootRules(this.host.world?.rules?.version ?? 1);
  }

  /** how much of the places' own food, drink, petrol and oil is still there (loot.ts PLACES_KEEP; 1: all — the harness's stand-ins) */
  private keep(): number {
    return this.host.keep?.() ?? 1;
  }

  /** which of a place's boxes each of its planned finds goes in (boxesOfFinds), by the place's id */
  private readonly findBoxes = new Map<string, number[]>();

  /** the plan of the world's road at the game's difficulty, laid over its places as one comes (null: none — the harness's stand-in worlds) */
  private plannerOf: SitePlanner | null | undefined;
  private planner(): SitePlanner | null {
    if (this.plannerOf === undefined) {
      const finds = this.plannedFinds();
      this.plannerOf = finds ? new SitePlanner(finds) : null;
      this.plannerOf?.add(this.host.added?.() ?? []);
    }
    return this.plannerOf;
  }

  /** finds added to the plan now (a set's next step: the game's): laid at the places still to come — returned as they were added (what the game keeps) */
  addFinds(finds: readonly PlannedFind[]): PlannedFind[] {
    return this.planner()?.add(finds) ?? [];
  }

  /** where the place that took one of the plan's finds is (m of road); undefined: none has yet */
  laidAt(f: PlannedFind): number | undefined {
    return this.planner()?.laidAt(f);
  }

  /** the plan's finds (made once: the host's planned) */
  private plannedOf: readonly PlannedFind[] | null | undefined;
  private plannedFinds(): readonly PlannedFind[] | null {
    if (this.plannedOf === undefined) this.plannedOf = this.host.planned?.() ?? null;
    return this.plannedOf;
  }

  /**
   * Where a place's own may first have each of the plan's new things (schedule.ts heldBackUntil: a Nomad Drive
   * building's coffee machine waits for the plan's first) — none held back without a plan, or in a world with a test lot
   * of prefabs (?nd=: its buildings as their cards have them, to look at)
   */
  private heldOf: Map<string, number> | undefined;
  private heldBack(): Map<string, number> {
    if (!this.heldOf) {
      const finds = this.host.world?.prefabs ? null : this.plannedFinds();
      this.heldOf = finds ? heldBackUntil(finds, this.rules().version >= 7) : new Map();
    }
    return this.heldOf;
  }

  /**
   * (a world of version 7) Is a thing of this key one of the plan's new things whose first is not due yet down to a
   * place at s (m) — and so not among the place's own, in a box or in plain sight? A world made before: never (its
   * buildings' things in plain sight wait by their own rule above, its boxes for nothing).
   */
  private heldNow(key: string, s: number): boolean {
    if (this.rules().version < 7) return false;
    const until = this.heldBack().get(key);
    return until !== undefined && s < until + THEME_WAIT_M;
  }

  // ------------------------------------------------------------------ containers

  /**
   * A container's device: E opens and shuts what has doors, drawers or a lid (what has none — shelves, a counter —
   * is no device: its things are simply there). Open, the things in it are nearer to the mark than its box.
   */
  private containerDevice(pc: PlaceContainer): GarageDevice {
    const c = pc.c;
    const host = this.host;
    const places = this;
    const h = c.solid ? c.h : 1.0;
    return {
      id: `box:${c.id}`,
      x: c.x,
      y: c.y + h * 0.6,
      z: c.z,
      radius: Math.max(0.3, Math.min(c.hx, c.hz) + 0.15),
      get word(): Text {
        return places.openNow.has(c.id) ? { zh: `关上<b>${pc.name}</b>`, en: `Shut the ${pc.name}` } : { zh: `打开<b>${pc.name}</b>`, en: `Open the ${pc.name}` };
      },
      get state(): Text {
        const open = places.openNow.has(c.id);
        const n = pc.contents?.length ?? 0;
        return { zh: open ? (n ? `开着，里面有 ${n} 样` : '开着，空的') : '关着', en: open ? 'Open' : 'Shut' };
      },
      get card(): ItemCard {
        const open = places.openNow.has(c.id);
        const n = pc.contents?.length ?? 0;
        return {
          key: `box:${c.id}:${open ? n : -1}`,
          icon: 'box',
          cat: `${PLACE_ZH[pc.site.sort] ?? '路边'} · 能打开`,
          name: pc.name,
          stars: 0,
          badges: [],
          blurb: BLURB[c.kind] ?? '',
          rows: [],
          bars: [],
          notes: [{ text: open ? (n ? `里面有 ${n} 样` : '空的') : '关着', tone: open && !n ? 'warn' : 'info' }],
          foot: {},
        };
      },
      use: (): void => places.toggle(pc),
      hit: (ray: THREE.Ray, reach: number): number | null => {
        // (only what opens: shelves and counters are no device)
        if (!places.opens(pc)) return null;
        const d = boxHit(ray, host.origin, c.x, c.y, c.z, c.yaw, c.hx, h, c.hz, reach);
        return d === null ? null : places.openNow.has(c.id) ? d + 1.2 : d;
      },
    };
  }

  /** does the container open (doors, drawers, a lid drawn; not drawn: what has a box to search by does not) */
  private opens(pc: PlaceContainer): boolean {
    const m = this.host.movesOf?.(pc.id, pc.site.id);
    return m === true;
  }

  /** E on a container: opened (its things in reach) or shut (out of reach again) */
  toggle(pc: PlaceContainer): void {
    const id = pc.id;
    const open = !this.openNow.has(id);
    if (open) this.openNow.add(id);
    else this.openNow.delete(id);
    this.host.setOpen?.(id, open);
    const material = CONTAINER_MATERIAL[pc.c.kind];
    this.host.play(open ? 'container_open' : 'container_close', { material });
    if (open && !this.searched.has(id)) {
      this.searched.add(id);
      // (things that go off are kept from the moment they are found: rolled again at the next visit they would be fresh again)
      if (pc.contents?.some((h) => h.kind === 'item' && h.item.fresh !== undefined)) this.left.set(id, pc.contents.map(savedOf));
      if (!pc.contents?.length) this.host.say(`${pc.name}是空的：有人先来过了。`, 2.2);
    }
    for (const l of pc.things) l.shut = !open && this.shutIn(pc, l);
  }

  /** is the thing in a shut container's shut part (behind its doors, in a drawer, under its lid)? */
  private shutIn(pc: PlaceContainer, l: Loose): boolean {
    return this.inShut.has(l);
  }

  /**
   * A container's things laid out in it, once its place is drawn (its model's places for them known) and their
   * models are in (so that each takes its own room): the biggest first, each where it stands (containerLayout.ts),
   * facing out of the container; what fits nowhere on the floor before it. A thing in a drawer rides the drawer.
   */
  private layOutIn(lp: LivePlace, pc: PlaceContainer): void {
    if (pc.laid || pc.laying || !pc.contents) return;
    const host = this.host;
    const slots = host.slots ? host.slots(pc.id, lp.site.id) : [];
    // (its place not drawn yet: at a later look)
    if (slots === null) return;
    pc.laying = true;
    const list = [...pc.contents];
    const sizes = Promise.all(list.map((h) => (host.measure ? host.measure(h).catch(() => null) : Promise.resolve(null))));
    void sizes.then((boxes) => {
      pc.laying = false;
      // (gone meanwhile, or laid out by another call)
      if (this.live.get(lp.site.id) !== lp || pc.laid) return;
      this.place(pc, slots, list, boxes);
    });
  }

  private place(pc: PlaceContainer, slots: readonly ContainerSlot[], list: NonNullable<Held>[], boxes: (ThingBox | null)[]): void {
    const host = this.host;
    const L = host.loose;
    const c = pc.c;
    const o = host.origin;
    const things: LayoutThing[] = boxes.map((b) => ({ ways: waysOf(b ?? ROUGH) }));
    // its places: the drawn ones, else its own top (or the ground by a bigger thing) as the world has it
    const rooms: LayoutRoom[] = slots.length ? slots.map((s) => ({ width: s.width, depth: s.depth, clear: s.clear })) : [{ width: Math.max(0.3, 2 * c.hx * 0.85), depth: Math.max(0.3, 2 * c.hz * 0.85), clear: c.solid ? Math.max(0.3, c.h - c.shelf + 0.6) : 1.2 }];
    const where = layOut(things, rooms);
    const open = this.openNow.has(pc.id);
    // the frame of each place: its origin and axes in the world (along it, into it, up)
    const at = new THREE.Vector3();
    const ax = new THREE.Vector3();
    const az = new THREE.Vector3();
    const frameOf = (r: number): void => {
      const s = slots[r];
      if (s) {
        s.frame.updateWorldMatrix(true, false);
        const e = s.frame.matrixWorld.elements;
        at.set(e[12] + o.x, e[13] + o.y, e[14] + o.z);
        ax.set(e[0], e[1], e[2]).normalize();
        az.set(e[8], e[9], e[10]).normalize();
        return;
      }
      // (the world's own box: along it (cos yaw, sin yaw), its front across it)
      at.set(c.x, c.y + c.shelf, c.z);
      az.set(Math.cos(c.yaw), 0, Math.sin(c.yaw));
      ax.set(-Math.sin(c.yaw), 0, Math.cos(c.yaw));
    };
    const q = new THREE.Quaternion();
    const qf = new THREE.Quaternion();
    const p = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      const h = list[i];
      const w = where[i];
      const b = boxes[i] ?? ROUGH;
      const way = WAYS[w.way] ?? WAYS[0];
      const size = things[i].ways[w.way] ?? things[i].ways[0];
      let slot: ContainerSlot | null = null;
      if (w.room >= 0) {
        frameOf(w.room);
        slot = slots[w.room] ?? null;
        // (deeper than the place: its back against the place's back, standing out of the front)
        const room = rooms[w.room];
        const out = size.d > room.depth ? (size.d - room.depth) / 2 : 0;
        at.addScaledVector(az, w.along).addScaledVector(ax, out);
      } else {
        // on the floor before it: out of its front by half its depth and the thing's
        frameOf(0);
        const depth = slots.length ? slots[0].depth : 2 * c.hz;
        at.addScaledVector(ax, depth / 2 + size.d / 2 + 0.12).addScaledVector(az, w.along);
        at.y = c.y;
      }
      // facing out of the container (its own +x along the place's), a quarter round if it was turned to fit
      const yaw = Math.atan2(ax.z, ax.x) + (way.turn ? Math.PI / 2 : 0);
      // (its box as it lies: its middle over the spot, its bottom on the place's floor)
      const lb = lieBox(b, way.lie);
      const cx = (lb.minX + lb.maxX) / 2;
      const cz = (lb.minZ + lb.maxZ) / 2;
      const x = at.x - Math.cos(yaw) * cx + Math.sin(yaw) * cz;
      const z = at.z - Math.sin(yaw) * cx - Math.cos(yaw) * cz;
      const y = at.y - lb.minY;
      const l = h.kind === 'part' ? L.addPart(h.inst, x, y, z, yaw) : h.kind === 'tool' ? L.addTool(h.tool, x, y, z, yaw) : L.addItem(h.item, x, y, z, yaw);
      l.resting = true;
      // (in a drawer it rides the drawer; laid on its side it rides its place, which holds it turned so)
      if (slot && (slot.moves || way.lie)) {
        const frame = slot.frame;
        frame.updateWorldMatrix(true, false);
        q.setFromAxisAngle(Y_UP, -yaw);
        if (way.lie) q.multiply(way.lie === 'z' ? LIE_Z : LIE_X);
        frame.getWorldQuaternion(qf).invert();
        const pos = frame.worldToLocal(p.set(x - o.x, y - o.y, z - o.z)).clone();
        L.ride(l, this.drawerOf(frame), { pos, rot: qf.multiply(q).clone() });
        if (way.lie) l.lie = way.lie;
      }
      const shut = !!slot?.shut;
      if (shut) this.inShut.add(l);
      if (slot?.back) this.behind.set(l, slot);
      l.shut = shut && !open;
      this.inside.set(l, { pc, h });
      pc.things.push(l);
    }
    pc.slots = slots;
    pc.laid = true;
  }

  /** the carrier a drawer's things ride: the marker in it */
  private drawerOf(frame: THREE.Object3D): Carrier {
    let c = this.drawers.get(frame);
    if (!c) this.drawers.set(frame, (c = { frame, surfaceAt: () => null }));
    return c;
  }

  /** the pump whose nozzle is out, in the vehicle being filled (siteArt.ts draws it there): its place and object */
  nozzle(): { site: string; obj: number; v: ModVehicle } | null {
    return this.nozzleOut;
  }

  /** has this container been searched? */
  isSearched(id: string): boolean {
    return this.searched.has(id);
  }

  /** a container searched (the first time: what is in it rolled) and its list opened */
  open(pc: PlaceContainer): void {
    this.searching = { id: '', p: 0 };
    if (!pc.searched) {
      pc.contents = this.roll(pc);
      pc.rev++;
      this.searched.add(pc.id);
      // (things that go off are kept from the moment they are found: rolled again at the next visit they would be fresh again)
      if (pc.contents.some((h) => h.kind === 'item' && h.item.fresh !== undefined)) this.left.set(pc.id, pc.contents.map(savedOf));
      if (!pc.contents.length) {
        this.host.play('container_empty', { material: CONTAINER_MATERIAL[pc.c.kind] });
        this.host.say(`${pc.name}是空的：有人先来过了。`, 2.2);
        return;
      }
    }
    if (!pc.contents!.length) {
      this.host.say(`${pc.name}里什么也没有了。`, 1.8);
      return;
    }
    this.host.openContainer(pc);
  }

  /** the i-th thing out of a container (into the hands): what is left is kept */
  take(pc: PlaceContainer, i: number): NonNullable<Held> | null {
    const list = pc.contents;
    if (!list || i < 0 || i >= list.length) return null;
    const [h] = list.splice(i, 1);
    this.kept(pc);
    return h;
  }

  /** a thing put back into a container */
  putBack(pc: PlaceContainer, h: NonNullable<Held>): void {
    (pc.contents ??= []).push(h);
    this.kept(pc);
  }

  /**
   * What is in a container changed (a thing out or in, or only some of a stack taken): from now on it is kept
   * as it stands, never rolled again. The save holds each thing whole (an item with its count, what is in it,
   * its freshness, quality and state).
   */
  kept(pc: PlaceContainer): void {
    pc.rev++;
    if (pc.contents) this.left.set(pc.id, pc.contents.map(savedOf));
  }

  // ------------------------------------------------------------------ pumps

  /** a pump as a tank a jerrycan is filled from */
  private pumpPort(site: Site, o: SiteObject, i: number, fuel: FuelType, st: { petrol: number; diesel: number }): TankPort {
    const host = this.host;
    const tank: FuelTank = { capacity: 1e6, fuel: { [fuel]: fuel === 'petrol' ? st.petrol : st.diesel } };
    const name = `加油机（${FUEL_ZH[fuel]}）`;
    const port: TankPort = {
      id: `pump:${site.id}/${i}`,
      tank,
      name,
      open: true,
      pump: true,
      hit: (ray, reach) => boxHit(ray, host.origin, o.x, o.y, o.z, o.yaw, o.w / 2 + 0.05, o.h, o.d / 2 + 0.05, reach),
      mouth: (m, out) => {
        // (the nozzle on its hook at the front, a metre up; the can held under it)
        const c = Math.cos(o.yaw);
        const s = Math.sin(o.yaw);
        const fx = s;
        const fz = -c;
        m.set(o.x + fx * (o.d / 2 + 0.1) - host.origin.x, o.y + 1.0 - host.origin.y, o.z + fz * (o.d / 2 + 0.1) - host.origin.z);
        out.set(fx, -0.3, fz).normalize();
        return true;
      },
      get card(): ItemCard {
        return pumpCard(site, i, fuel, tank.fuel[fuel] ?? 0);
      },
      changed: () => {
        if (fuel === 'petrol') st.petrol = tank.fuel.petrol ?? 0;
        else st.diesel = tank.fuel.diesel ?? 0;
      },
    };
    return port;
  }

  /** a pump as a device: with empty hands by a vehicle parked at it, E held fills the vehicle's tank */
  private pumpDevice(site: Site, o: SiteObject, i: number, fuel: FuelType, st: { petrol: number; diesel: number }): GarageDevice {
    const host = this.host;
    const places = this;
    const id = `pumpdev:${site.id}/${i}`;
    const left = (): number => (fuel === 'petrol' ? st.petrol : st.diesel);
    const take = (l: number): void => {
      if (fuel === 'petrol') st.petrol = Math.max(0, st.petrol - l);
      else st.diesel = Math.max(0, st.diesel - l);
    };
    /** the vehicle parked at it (its body within reach), with a tank */
    const parked = (): ModVehicle | null => {
      let best: ModVehicle | null = null;
      let bd = PUMP_REACH;
      for (const v of host.vehicles) {
        const d = Math.hypot(v.sim.px - o.x, v.sim.pz - o.z) - v.sim.spec.body.halfLength;
        if (d < bd && tankRoomOf(v.build) !== null) {
          bd = d;
          best = v;
        }
      }
      return best;
    };
    const need = (v: ModVehicle): number => Math.min(tankRoomOf(v.build) ?? 0, left());
    return {
      id,
      x: o.x,
      y: o.y + 1.1,
      z: o.z,
      radius: 0.5,
      get card(): ItemCard {
        return pumpCard(site, i, fuel, left());
      },
      get word(): Text {
        return { zh: `加${FUEL_ZH[fuel]}`, en: `Fill up with ${fuel}` };
      },
      // (dry, no car by it, its tank full: pressing does nothing — said when pressed)
      get why(): Text | null {
        const v = parked();
        if (left() <= 0.5) return { zh: '没油了', en: 'The pump is dry' };
        if (!v) return { zh: '把车停过来', en: 'Park a car by it' };
        if ((tankRoomOf(v.build) ?? 0) <= 0.05) return { zh: '油箱满了', en: 'The tank is full' };
        return null;
      },
      get holdS(): number | undefined {
        const v = parked();
        if (!v || left() <= 0.5) return undefined;
        const n = need(v);
        return n > 0.05 ? Math.max(0.6, n / PUMP_RATE) : undefined;
      },
      holding: (p: number): void => {
        const v = parked();
        if (!v) return;
        // (a new hold: so much to go in; then a share of it as the ring fills)
        if (!places.fill || places.fill.dev !== id || p < places.fill.p - 1e-6) {
          places.fill = { dev: id, need: need(v), given: 0, p: 0 };
          host.play('pump_lift');
        }
        const f = places.fill;
        f.p = p;
        // (the nozzle out of its hook and in the filler while the hold lasts)
        places.nozzleOut = { site: site.id, obj: i, v, until: places.clock + 0.25 };
        const want = f.need * p - f.given;
        if (want > 0) {
          const moved = pumpInto(v.build, fuel, want);
          f.given += moved;
          take(moved);
          if (moved > 0) host.fuelled(v);
        }
        host.loop('pump_run', { gain: 0.9 });
      },
      use: (): void => {
        const v = parked();
        const f = places.fill;
        places.fill = null;
        if (!v) {
          return;
        }
        if (f) {
          const rest = f.need - f.given;
          if (rest > 0.01) {
            const moved = pumpInto(v.build, fuel, rest);
            f.given += moved;
            take(moved);
            host.fuelled(v);
          }
          host.play(left() <= 0.5 ? 'pump_dry' : 'pump_click');
          // (the nozzle hung back a moment after)
          host.play('pump_hang', {}, left() <= 0.5 ? 1.5 : 0.45);
          places.nozzleOut = { site: site.id, obj: i, v, until: places.clock + (left() <= 0.5 ? 1.5 : 0.45) };
          host.say(`加了 ${f.given.toFixed(1)} L`, 2);
        }
      },
      hit: (ray: THREE.Ray, reach: number): number | null => boxHit(ray, host.origin, o.x, o.y, o.z, o.yaw, o.w / 2 + 0.05, o.h, o.d / 2 + 0.05, reach),
    };
  }

  // ------------------------------------------------------------------ the save

  snapshot(): PlacesSave {
    // (what was taken, moved or changed since the last frame is let go first: `taken` and the things the game
    // saves as lying about then say the same, whichever is asked first)
    for (const [l, o] of this.owned) this.letGo(l, o);
    for (const lp of this.live.values()) if (lp.workshop) this.shops.set(lp.site.id, lp.workshop.snapshot());
    this.lookInside();
    return { searched: [...this.searched], open: [...this.openNow], left: Object.fromEntries(this.left), pumps: Object.fromEntries(this.pumps), taken: [...this.taken], shops: Object.fromEntries(this.shops) };
  }

  /** the places there now (the probes') */
  telemetry(): Record<string, unknown> {
    return {
      live: [...this.live.values()].map((lp) => ({ id: lp.site.id, kind: lp.site.kind, sort: lp.site.sort, containers: lp.containers.length, laid: lp.containers.filter((pc) => pc.laid).length, inside: lp.containers.reduce((n, pc) => n + pc.things.length, 0), pumps: lp.ports.length, loose: lp.loose.size, workshop: lp.workshop ? lp.workshop.telemetry() : null })),
      open: this.openNow.size,
      searched: this.searched.size,
      taken: this.taken.size,
      owned: this.owned.size,
    };
  }

  /** a container there now, by its id */
  containerOf(id: string): PlaceContainer | null {
    for (const lp of this.live.values()) for (const pc of lp.containers) if (pc.id === id) return pc;
    return null;
  }

  /** the kind of a place there now (a house, a filling station …), by its id: what its floors are (the footsteps) */
  siteKind(id: string): string | null {
    return this.live.get(id)?.site.kind ?? null;
  }
}

/** a pump's card: what it holds and how to use it */
function pumpCard(site: Site, i: number, fuel: FuelType, left: number): ItemCard {
  return {
    key: `pump:${site.id}/${i}:${Math.round(left)}`,
    icon: 'device',
    cat: '加油站 · 加油机',
    name: `加油机（${FUEL_ZH[fuel]}）`,
    stars: 0,
    badges: [],
    blurb: '老式加油机。',
    rows: [{ value: `${Math.round(left)} L`, label: `还剩${FUEL_ZH[fuel]}` }],
    bars: [],
    notes: left <= 0.5 ? [{ text: '没油了', tone: 'warn' }] : [],
    foot: {},
  };
}

/** a stable number from an id */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}
