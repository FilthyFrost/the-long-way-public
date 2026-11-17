/**
 * The places by the road in ModCar (docs/MODCAR.md §20, Arctic Drive's buildings): what one can do at them.
 *
 *  - Every container the world lays out (core/world/sites.ts: a kitchen's cupboard, a filling station's till, a
 *    garage's drawers and its shelves, a crate by the verge) is searched by holding E on it (the rummage heard);
 *    then a list of what is in it opens (the cargo list's), ModCar's own things by what it is and where it stands
 *    (core/modcar/loot.ts), and one takes them out into the hands. Searched once; what is left in it stays.
 *  - A filling station's pumps hold petrol and diesel: a jerrycan held to one fills from it (E), and with empty
 *    hands by a vehicle parked at it, E held fills the vehicle's tank (the pump's hum, its click when it is full).
 *  - The things lying in plain sight at a place are ModCar's: junk to recycle, a tyre, a jerrycan, food.
 *
 * Everything is there while one is within reach of the place and goes when one has gone on: what was taken or
 * moved, what was searched and taken out, how much is left in the pumps is kept (in the save too).
 */
import * as THREE from 'three';
import type { ContainerKind } from '../../core/items/loot';
import { newItem, type ItemInstance } from '../../core/modcar/items';
import { CONTAINER_MATERIAL, CONTAINER_NAMES, looseFound, rollContainer, stationFuel, type Found } from '../../core/modcar/loot';
import { pumpInto, tankRoomOf, type FuelTank, type Tool } from '../../core/modcar/tools';
import type { FuelType, PartInstance, Text } from '../../core/modcar/types';
import type { Site, SiteContainer, SiteObject } from '../../core/world/sites';
import type { World } from '../../core/world/terrain';
import type { GarageDevice } from './garageStub';
import { FUEL_ZH, type ItemCard } from './itemInfo';
import type { Loose, LooseThings } from './loose';
import type { Held, TankPort } from './player';
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
const PLACE_ZH: Record<string, string> = { station: '加油站', garage: '修车铺', shop: '商店', house: '民房', camp: '营地', jetty: '码头', hide: '猎人的地方', lookout: '瞭望台', lighthouse: '灯塔', works: '工厂', roadside: '路边' };

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
  tacklebox: '谁的钓具箱。',
  gamebag: '猎人留下的包。',
  garage: '修车铺的零件架：大件都在这儿，越往远处越好。',
};

/** a thing as a save keeps it */
export type SavedThing = { item?: ItemInstance; tool?: Tool; part?: PartInstance };

export interface PlacesSave {
  /** the containers searched */
  searched: string[];
  /** what is left in those something was taken out of */
  left: Record<string, SavedThing[]>;
  /** the pumps' litres left, by the station's tank */
  pumps: Record<string, { petrol: number; diesel: number }>;
  /** the things in plain sight taken or moved (by their id) */
  taken: string[];
  /** the roadside garages' machines (their generators' fuel, whether they run, a thing on the bench), by the site */
  shops?: Record<string, WorkshopSave>;
}

export function heldOfFound(f: Found): NonNullable<Held> {
  if ('item' in f) return { kind: 'item', item: newItem(f.item) };
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
  /** what is in it (null until it is searched) */
  contents: NonNullable<Held>[] | null = null;
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

export function isContainer(x: unknown): x is PlaceContainer {
  return x instanceof PlaceContainer;
}

/** what the places need of the game */
export interface PlacesHost {
  readonly world: World | null;
  readonly origin: { x: number; y: number; z: number };
  readonly loose: LooseThings;
  readonly vehicles: readonly ModVehicle[];
  /** a sound (foley.ts) by name, with its options */
  play(name: string, opts?: Record<string, unknown>): void;
  /** a loop kept going this frame */
  loop(name: string, opts?: Record<string, unknown>): void;
  say(text: string, seconds?: number): void;
  /** the list of what is in a container, opened */
  openContainer(pc: PlaceContainer): void;
  /** fuel went into a vehicle */
  fuelled(v: ModVehicle): void;
  /** a roadside garage's machines, made as one comes (null: it has no room for them) and taken away as one goes */
  makeWorkshop?(site: Site, save?: WorkshopSave): Workshop | null;
  dropWorkshop?(ws: Workshop): void;
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
  /** a pump filling a vehicle: how much it was to take when the hold began, how much has gone in */
  private fill: { dev: string; need: number; given: number; p: number } | null = null;

  constructor(
    private readonly host: PlacesHost,
    save?: PlacesSave,
  ) {
    if (save) {
      for (const id of save.searched ?? []) this.searched.add(id);
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

  /** is it one of the places' own things lying about (not yet taken or moved)? */
  owns(l: Loose): boolean {
    return this.owned.has(l);
  }

  /** every frame: the places within reach of (x, z) there, the ones left behind gone */
  update(dt: number, x: number, z: number): void {
    const world = this.host.world;
    if (!world) return;
    // (a thing of a place's picked up or moved: one's own from then on)
    for (const [l, o] of this.owned) {
      const lp = this.live.get(o.site);
      const at = lp?.loose.get(o.id);
      if (!this.host.loose.list.includes(l) || (at && Math.hypot(l.x - at.x, l.z - at.z) > 0.25)) {
        this.taken.add(o.id);
        this.owned.delete(l);
        lp?.loose.delete(o.id);
      }
    }
    if ((this.checkT -= dt) > 0) return;
    this.checkT = CHECK_EVERY;
    const s = world.spine.sAtX(x);
    this.sites.length = 0;
    world.sites.between(s - FAR - 300, s + FAR + 300, this.sites);
    let changed = false;
    for (const site of this.sites) {
      if (site.kind === 'roadside' && !site.containers.length && !site.loose.length) continue;
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
      const pc = new PlaceContainer(c, site, CONTAINER_NAMES[c.kind] ?? '箱子');
      const kept = this.left.get(c.id);
      if (kept) pc.contents = kept.map(heldOfSaved).filter((h): h is NonNullable<Held> => !!h);
      else if (this.searched.has(c.id)) pc.contents = this.roll(pc);
      lp.containers.push(pc);
      lp.devices.push(this.containerDevice(pc));
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
    for (const t of site.loose) {
      if (this.taken.has(t.id)) continue;
      const f = looseFound(t.item, hashId(t.id), site.s, site.kind);
      if (!f) continue;
      const h = heldOfFound(f);
      const L = this.host.loose;
      const l = h.kind === 'part' ? L.addPart(h.inst, t.x, t.y, t.z, t.yaw) : h.kind === 'tool' ? L.addTool(h.tool, t.x, t.y, t.z, t.yaw) : L.addItem(h.item, t.x, t.y, t.z, t.yaw);
      // (it lies where it lies: on the ground, on a counter, on a pump)
      l.resting = true;
      lp.loose.set(t.id, { l, x: t.x, y: t.y, z: t.z });
      this.owned.set(l, { site: site.id, id: t.id });
    }
  }

  private go(id: string, lp: LivePlace): void {
    if (lp.workshop) {
      this.shops.set(id, lp.workshop.snapshot());
      this.host.dropWorkshop?.(lp.workshop);
      lp.workshop = null;
    }
    for (const [, t] of lp.loose) {
      if (!this.owned.has(t.l)) continue;
      this.owned.delete(t.l);
      this.host.loose.remove(t.l);
    }
    this.live.delete(id);
  }

  /** what a container holds, rolled (the same every time) */
  private roll(pc: PlaceContainer): NonNullable<Held>[] {
    return rollContainer(pc.c.kind, pc.c.seed, pc.site.s, pc.site.kind).map(heldOfFound);
  }

  // ------------------------------------------------------------------ containers

  private containerDevice(pc: PlaceContainer): GarageDevice {
    const c = pc.c;
    const host = this.host;
    const places = this;
    const material = CONTAINER_MATERIAL[c.kind];
    // (by a bigger thing — a caravan's cupboard — the box is a place to search at, a metre high)
    const h = c.solid ? c.h : 1.0;
    return {
      id: `box:${c.id}`,
      x: c.x,
      y: c.y + h * 0.6,
      z: c.z,
      radius: Math.max(0.3, Math.min(c.hx, c.hz) + 0.15),
      get word(): Text {
        if (!pc.searched) return { zh: `翻找<b>${pc.name}</b>`, en: `Search the ${pc.name}` };
        const n = pc.contents!.length;
        return n ? { zh: `看看<b>${pc.name}</b>里（还有 ${n} 样）`, en: `Look in the ${pc.name} (${n} left)` } : { zh: `<b>${pc.name}</b> · 空了`, en: `The ${pc.name} is empty` };
      },
      get state(): Text {
        return pc.searched ? { zh: pc.contents!.length ? `翻过了，还剩 ${pc.contents!.length} 样` : '翻过了，空的', en: '' } : { zh: '还没翻过', en: 'Not searched yet' };
      },
      get holdS(): number | undefined {
        return pc.searched ? undefined : 0.8;
      },
      get card(): ItemCard {
        const n = pc.contents?.length ?? 0;
        return {
          key: `box:${c.id}:${pc.searched ? n : -1}`,
          icon: 'box',
          cat: `${PLACE_ZH[pc.site.kind] ?? '路边'} · 能翻找`,
          name: pc.name,
          stars: 0,
          badges: [],
          blurb: BLURB[c.kind] ?? '',
          rows: [],
          bars: [],
          notes: [{ text: pc.searched ? (n ? `翻过了，还剩 ${n} 样` : '翻过了，空的') : '还没翻过：按住 E 翻找', tone: pc.searched && !n ? 'warn' : 'info' }],
          foot: {},
        };
      },
      holding: (p: number): void => {
        if (p < 0.05) host.play('container_open', { material });
        host.loop('rummage', { material, gain: 0.9 });
      },
      use: (): void => places.open(pc),
      hit: (ray: THREE.Ray, reach: number): number | null => boxHit(ray, host.origin, c.x, c.y, c.z, c.yaw, c.hx, h, c.hz, reach),
    };
  }

  /** a container searched (the first time: what is in it rolled) and its list opened */
  open(pc: PlaceContainer): void {
    if (!pc.searched) {
      pc.contents = this.roll(pc);
      this.searched.add(pc.id);
      if (!pc.contents.length) {
        this.host.play('container_empty');
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
    this.left.set(pc.id, list.map(savedOf));
    return h;
  }

  /** a thing put back into a container */
  putBack(pc: PlaceContainer, h: NonNullable<Held>): void {
    (pc.contents ??= []).push(h);
    this.left.set(pc.id, pc.contents.map(savedOf));
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
        const v = parked();
        if (left() <= 0.5) return { zh: `加油机（${FUEL_ZH[fuel]}）· 没油了`, en: 'The pump is dry' };
        if (!v) return { zh: `加油机 · ${FUEL_ZH[fuel]}还剩 ${Math.round(left())} L（把车停过来，或者拿油桶来灌）`, en: `Pump · ${Math.round(left())} L` };
        if ((tankRoomOf(v.build) ?? 0) <= 0.05) return { zh: `${v.view.frame.name.zh}的油箱满了`, en: 'The tank is full' };
        return { zh: `给<b>${v.view.frame.name.zh}</b>加${FUEL_ZH[fuel]}（加满要 ${Math.round(need(v))} L）`, en: `Fill up with ${fuel}` };
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
          host.say(left() > 0.5 ? '把车停到加油机旁边，或者拿着油桶来灌。' : '这台加油机没油了。', 2.4);
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
          host.play('pump_hang');
          host.say(`加了 ${f.given.toFixed(1)} L ${FUEL_ZH[fuel]}${left() <= 0.5 ? '：加油机空了' : ''}`, 2.4);
        }
      },
      hit: (ray: THREE.Ray, reach: number): number | null => boxHit(ray, host.origin, o.x, o.y, o.z, o.yaw, o.w / 2 + 0.05, o.h, o.d / 2 + 0.05, reach),
    };
  }

  // ------------------------------------------------------------------ the save

  snapshot(): PlacesSave {
    for (const lp of this.live.values()) if (lp.workshop) this.shops.set(lp.site.id, lp.workshop.snapshot());
    return { searched: [...this.searched], left: Object.fromEntries(this.left), pumps: Object.fromEntries(this.pumps), taken: [...this.taken], shops: Object.fromEntries(this.shops) };
  }

  /** the places there now (the probes') */
  telemetry(): Record<string, unknown> {
    return {
      live: [...this.live.values()].map((lp) => ({ id: lp.site.id, kind: lp.site.kind, containers: lp.containers.length, pumps: lp.ports.length, loose: lp.loose.size, workshop: lp.workshop ? lp.workshop.telemetry() : null })),
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
    blurb: '老式加油机。拿着油桶对着它按住 E 灌满；把车停在旁边，空手对着它按住 E 直接给车加满。',
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
