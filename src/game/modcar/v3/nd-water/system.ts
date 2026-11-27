/**
 * The ND water in the game (docs/ND/PLAN.md, ND2; its rules: core/v3/nd/water.ts, as Nomad Drive's
 * liquid transfer system has them):
 *
 *  - Every vessel lying about (a water can, a bucket, a mug, a bottle of water, the radiator's water bottle) is a
 *    device the mark finds. With a vessel in the hands, E held runs liquid between the two the way it can — out of
 *    the hands where it may, else into them — and F held the other way where that may go too; the one in the hands
 *    goes over to it as it runs: tipped over its mouth with the stream running, or dipped into it. With empty hands
 *    E picks it up (F held as well).
 *  - A hand pump (a thing of its own standing on its well head, at a water pump's place) gives what is left of its
 *    twenty litres: a vessel held to it with E held fills under its spout while the handle rocks. It is never filled
 *    again; what each pump has left is kept (the save's slice `nd-water`).
 *  - A bucket or a mug left out in the rain with nothing over its mouth fills (the rain followed over eight
 *    seconds, looked at every two); one with an open top shows its level, in its liquid's colour.
 *  - A water can or a bucket is found a quarter to wholly full: by where its place laid it, the same every visit
 *    until it is one's own; one first seen in the hands by its own id.
 *  - A sponge worn by scrubbing comes good again in a bucket of water (Nomad Drive's: a tenth of it a second, a
 *    tenth of a litre a second — a litre for a whole sponge): with it in the hands, E held on the bucket.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { hash2 } from '../../../../core/math/rng';
import { itemDef, type DrinkLiquid } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import {
  catchRain,
  flowWhy,
  foundFill,
  handleStep,
  intoHands,
  newCatcher,
  newHandle,
  ND_PUMP,
  pour,
  pourS,
  PUMP,
  pumpFound,
  pumpVessel,
  RAIN,
  VESSELS,
  type Catcher,
  type FlowWhy,
  type Handle,
  type Vessel,
} from '../../../../core/v3/nd/water';
import { Solid, solidWithin, type SolidSource } from '../../../../core/world/solids';
import { surfaceMaterial } from '../../../render/materials';
import type { GarageDevice } from '../../garageStub';
import type { Action } from '../../hudItems';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import type { HandsUse, Held } from '../../player';
import { LiquidStream } from '../../stream';
import { blenderBox, boxHit, extraOf, markerOf, modelOf, type PartBox } from '../../nd/kit';
import { heldVessel, LIQUID, looseVessel, openingsOf, type Openings } from '../../nd/vessel';

const T = (zh: string, en: string): Text => ({ zh, en });
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

/** a vessel's box for the mark (its model's frame, as its script has it) */
const BOX: Record<string, PartBox> = {
  nd_bucket: blenderBox(0.0, 0.0, 0.17, 0.3, 0.3, 0.34),
  nd_water_can: blenderBox(0.0, 0.0, 0.24, 0.36, 0.2, 0.48),
  nd_mug: blenderBox(0.0, 0.0, 0.05, 0.1, 0.12, 0.1),
  coffee_pot: blenderBox(0.015, 0.0, 0.075, 0.17, 0.14, 0.15),
  drink_water: blenderBox(0.0, 0.0, 0.17, 0.12, 0.12, 0.34),
  nd_milk: blenderBox(0.0, 0.0, 0.12, 0.09, 0.09, 0.24),
  'tool:bottle': blenderBox(0.0, 0.0, 0.185, 0.22, 0.2, 0.37),
};
const BOX_PUMP = blenderBox(0.04, 0.0, 0.32, 0.34, 0.2, 0.62);
/** how far a vessel in the hands is tipped to pour (rad) */
const TIP: Record<string, number> = { nd_bucket: 1.0, nd_water_can: 1.15, nd_mug: 1.25, coffee_pot: 1.05, drink_water: 1.7, nd_milk: 1.6, 'tool:bottle': 1.5 };
/** a pour shown this long after its last step */
const SHOW_S = 0.12;
/** a sponge in a bucket of water: so much of it comes good a second, on so much water a second (L) */
const RINSE = 0.1;
const RINSE_L = 0.1;

const WHY: Record<Exclude<FlowWhy, 'ok'>, string> = {
  noOut: '它只进不出',
  noIn: '它只出不进',
  other: '里面装的东西不一样',
  empty: '空了',
  full: '满了',
};

function nameOf(l: Loose): string {
  if (l.item) return itemDef(l.item.item).name.zh;
  return l.tool?.kind === 'bottle' ? '水壶' : '容器';
}
function heldNameOf(h: NonNullable<Held>): string {
  if (h.kind === 'item') return itemDef(h.item.item).name.zh;
  return h.kind === 'tool' && h.tool.kind === 'bottle' ? '水壶' : '它';
}
function keyOf(l: Loose): string {
  return l.item ? l.item.item : l.tool ? `tool:${l.tool.kind}` : '';
}
function heldKey(h: NonNullable<Held>): string {
  return h.kind === 'item' ? h.item.item : h.kind === 'tool' ? `tool:${h.tool.kind}` : '';
}
function levelText(v: Vessel): string {
  const q = v.liquid;
  return `${v.litres.toFixed(v.holds >= 5 ? 1 : 2)} / ${v.holds} L${q ? ` ${LIQUID[q].zh}` : ''}`;
}
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h | 0;
}

/** what a device of this system gives and takes: a vessel lying about, or a pump */
abstract class WaterThing implements GarageDevice {
  abstract readonly id: string;
  abstract readonly x: number;
  abstract readonly y: number;
  abstract readonly z: number;
  abstract readonly radius: number;
  abstract readonly word: Text;
  /** the hold under way: how far along, when last, its length (fixed as it begins) */
  pourK = 0;
  pourAt = -1;
  holdLen = 0;
  readonly alt = null;
  constructor(readonly sys: NdWater) {}
  abstract vessel(): Vessel;
  abstract use(): void;
  get holdS(): number | undefined {
    return this.sys.holdAt(this);
  }
  holding(k: number): void {
    this.sys.holdingAt(this, k);
  }
  take(held: NonNullable<Held>): { ok: boolean; word: Text; keep?: boolean } | null {
    return this.sys.takeAt(this, held);
  }
}

/** a vessel lying about (or riding in a vehicle) */
class VesselThing extends WaterThing {
  readonly id: string;
  readonly radius = 0.22;
  constructor(
    sys: NdWater,
    readonly ly: Lying,
  ) {
    super(sys);
    this.id = `nd-water:${ly.l.uid}`;
  }
  get loose(): Loose {
    return this.ly.l;
  }
  get x(): number {
    return this.ly.l.x;
  }
  get y(): number {
    return this.ly.l.y + this.ly.l.mid;
  }
  get z(): number {
    return this.ly.l.z;
  }
  get word(): Text {
    return this.sys.wordAt(this);
  }
  get card(): ItemCard | undefined {
    return this.ly.l.item ? itemCardKept(this.ly.l.item, itemNow(), this.sys.time) : undefined;
  }
  vessel(): Vessel {
    return this.ly.v;
  }
  use(): void {
    if (this.sys.heldV()) {
      if (!this.sys.isLockedDone(this)) this.sys.holdingAt(this, 1);
    } else this.sys.pickUp(this.ly.l);
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    const d = boxHit(this.ly.l.obj, ray, BOX[keyOf(this.ly.l)] ?? BOX.nd_bucket, reach);
    return d === null ? null : d + 0.04;
  }
}

/** a hand pump standing where its place put it */
class PumpThing extends WaterThing {
  readonly id: string;
  readonly radius = 0.3;
  private cardV = -1;
  private cardC: ItemCard | null = null;
  constructor(
    sys: NdWater,
    readonly pm: Pump,
  ) {
    super(sys);
    this.id = `nd-water:pump:${pm.key}`;
  }
  get x(): number {
    return this.pm.l.x;
  }
  get y(): number {
    return this.pm.l.y + 0.35;
  }
  get z(): number {
    return this.pm.l.z;
  }
  get word(): Text {
    return this.sys.wordAt(this);
  }
  get state(): Text {
    const l = this.sys.pumpLitres(this.pm);
    return l > 0.01 ? T(`井里还有 ${l.toFixed(1)} 升水`, `${l.toFixed(1)} L left`) : T('抽干了', 'Dry');
  }
  get card(): ItemCard {
    const l = Math.round(this.sys.pumpLitres(this.pm) * 10) / 10;
    if (this.cardC && this.cardV === l) return this.cardC;
    this.cardV = l;
    const d = itemDef(ND_PUMP);
    this.cardC = {
      key: `nd-pump:${this.pm.key}`,
      icon: 'device',
      cat: '取水',
      name: d.name.zh,
      stars: 0,
      badges: [],
      blurb: d.blurb,
      rows: [],
      bars: [{ label: '井里的水', value: l, max: PUMP.holds, text: `${l.toFixed(1)} / ${PUMP.holds} L`, tone: 'water' }],
      notes: l > 0.01 ? [] : [{ text: '抽干了', tone: 'warn' }],
      foot: {},
      kept: true,
    };
    return this.cardC;
  }
  vessel(): Vessel {
    return this.pm.v;
  }
  use(): void {
    if (this.sys.heldV()) this.sys.holdingAt(this, 1);
    else this.sys.flash('拿着桶来接');
  }
  hit(ray: THREE.Ray, reach: number): number | null {
    return boxHit(this.pm.l.obj, ray, BOX_PUMP, reach);
  }
}

/** a vessel lying about, as this keeps it */
interface Lying {
  l: Loose;
  v: Vessel;
  thing: VesselThing;
  open: Openings;
  rainMin: number;
  catcher: Catcher | null;
  /** its level drawn (an open top), the model it was made for */
  disc: THREE.Mesh | null;
  /** rain has gone into it (it is one's own from then on: touched once) */
  wet: boolean;
}

interface Pump {
  l: Loose;
  key: string;
  v: Vessel;
  thing: PumpThing;
  handle: Handle;
  /** the handle's model child, its rest, the model it is of */
  obj: THREE.Object3D | null;
  q0: THREE.Quaternion;
  model: THREE.Object3D | null;
  spout: THREE.Vector3;
  solid: Solid;
}

/** the liquid running now (shown while its steps go on): between the hands and a device of this, or out of the hands into a mouth another system has (a pot's soil) */
interface Running {
  from: WaterThing | { mouth: THREE.Vector3 };
  /** into the hands */
  into: boolean;
  at: number;
  liquid: DrinkLiquid | null;
}

interface Saved {
  /** what is left in each pump that has given (by its place) */
  pumps?: Record<string, number>;
}

export class NdWater implements System<GameContext>, InteractSource, SolidSource {
  readonly id = 'nd-water';
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  time = 0;
  private readonly lying = new Map<Loose, Lying>();
  private readonly pumps = new Map<Loose, Pump>();
  private readonly left = new Map<string, number>();
  private rev = -1;
  private running: Running | null = null;
  private pinned = false;
  private stream: LiquidStream | null = null;
  private readonly mats = new Map<DrinkLiquid, THREE.Material>();
  private discGeo: THREE.CircleGeometry | null = null;
  private cylGeo: THREE.CylinderGeometry | null = null;
  private hvFor: Held | null = null;
  private hv: Vessel | null = null;
  private readonly ray = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly pinP = new THREE.Vector3();
  private readonly pinQ = new THREE.Quaternion();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  /** litres run so far (the harness) */
  poured = 0;
  caught = 0;

  readonly slice: SaveSlice<Saved> = {
    id: 'nd-water',
    version: 1,
    snapshot: () => {
      if (!this.left.size) return undefined;
      const pumps: Record<string, number> = {};
      for (const [k, v] of [...this.left].sort((x, y) => (x[0] < y[0] ? -1 : 1))) pumps[k] = Math.round(v * 1000) / 1000;
      return { pumps };
    },
    restore: (d) => {
      this.left.clear();
      for (const [k, v] of Object.entries(d.pumps ?? {})) if (typeof v === 'number' && Number.isFinite(v)) this.left.set(k, Math.max(0, Math.min(PUMP.holds, v)));
    },
    clear: () => this.left.clear(),
  };

  /** wheel flips pour/siphon direction when both directions are possible; E held also transfers (RMB stays free for eye zoom) */
  private flip = false;
  private flipDev: WaterThing | null = null;
  /** locks transfer direction for a single button hold so emptying/filling never ping-pongs liquid back and forth */
  private activeLock: { dev: WaterThing; into: boolean; done: boolean } | null = null;
  private eHoldWas = false;
  readonly hands: HandsUse = {
    id: 'nd-water',
    claims: (h) => this.aimedWater(h) !== null,
    takesF: (h) => this.aimedWater(h) !== null,
    wheel: (h) => {
      if (!this.canFlip(h)) return false;
      this.flip = !this.flip;
      this.activeLock = null;
      this.ctx?.sound('switch', 0.35);
      return true;
    },
    step: (h, dt, e) => this.handStep(h, dt, e),
    words: (h) => this.handWords(h),
    gone: () => {
      this.flip = false;
      this.flipDev = null;
      this.activeLock = null;
      this.eHoldWas = false;
      this.unpin();
    },
  };

  isLockedDone(dev: WaterThing): boolean {
    return !!this.activeLock && this.activeLock.dev === dev && this.activeLock.done;
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.player.hands?.push(this.hands);
    ctx.addSolids(this);
  }

  // ------------------------------------------------------------------ the vessels and pumps about

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    const seed = ctx.world?.seed ?? 0;
    for (const l of loose.list) {
      if (l.item?.item === ND_PUMP) {
        seen.add(l);
        l.device = true;
        if (!this.pumps.has(l)) this.addPump(l, seed);
        continue;
      }
      const v = looseVessel(l);
      if (!v) continue;
      seen.add(l);
      l.device = true;
      if (this.lying.has(l)) continue;
      // (found where a place laid it: by where, the same every visit)
      if (l.item && foundFill(l.item, hash2(Math.round(l.x * 20), Math.round(l.z * 20), seed))) this.rev = -1;
      const open = openingsOf(l);
      const rainMin = (l.item && VESSELS[l.item.item]?.rainMin) || 0;
      const ly: Lying = { l, v: looseVessel(l)!, thing: null as unknown as VesselThing, open, rainMin, catcher: rainMin ? newCatcher(hashStr(l.uid)) : null, disc: null, wet: false };
      ly.thing = new VesselThing(this, ly);
      this.lying.set(l, ly);
      if (open.open) loose.keepApart(l.uid, true);
    }
    for (const [l, ly] of [...this.lying]) {
      if (seen.has(l)) continue;
      ly.disc?.removeFromParent();
      if (ly.open.open) loose.keepApart(l.uid, false);
      this.lying.delete(l);
    }
    for (const [l, p] of [...this.pumps]) {
      if (seen.has(l)) continue;
      loose.keepApart(l.uid, false);
      this.pumps.delete(l);
    }
  }

  private addPump(l: Loose, seed: number): void {
    // (a pump is known by where it stands: Nomad Drive's fixture key)
    const key = `${Math.round(l.x * 10)},${Math.round(l.z * 10)}`;
    const start = pumpFound(seed, hashStr(key));
    const p: Pump = {
      l,
      key,
      v: pumpVessel(
        () => this.left.get(key) ?? start,
        (x) => void this.left.set(key, x),
      ),
      thing: null as unknown as PumpThing,
      handle: newHandle(),
      obj: null,
      q0: new THREE.Quaternion(),
      model: null,
      spout: new THREE.Vector3(0.196, 0.214, 0),
      solid: new Solid().set(l.x, l.z, 0.12, 0.12, l.yaw, l.y, l.y + 0.7, false, 'nd-pump'),
    };
    p.thing = new PumpThing(this, p);
    this.pumps.set(l, p);
    this.ctx!.loose.keepApart(l.uid, true);
  }

  pumpLitres(p: Pump): number {
    return p.v.litres;
  }

  /**
   * Another system's pour out of the hands into a mouth of its own (a pot's soil: nd-garden), told every step it
   * runs: shown as this shows its own — the vessel in the hands tipped over it, the stream, the sound. The mouth
   * in world metres.
   */
  pourOut(x: number, y: number, z: number, liquid: DrinkLiquid | null): void {
    const o = this.ctx?.core.origin;
    if (!o) return;
    const prev = this.running && !(this.running.from instanceof WaterThing) ? this.running.from.mouth : null;
    const mouth = (prev ?? new THREE.Vector3()).set(x - o.x, y - o.y, z - o.z);
    this.running = { from: { mouth }, into: false, at: this.time, liquid };
  }

  /** the vessel in the hands (a view of it, made again only when the hands hold another thing) */
  heldV(): Vessel | null {
    const h = this.ctx?.player.held ?? null;
    if (h !== this.hvFor) {
      this.hvFor = h;
      this.hv = heldVessel(h);
    }
    return this.hv;
  }

  // ------------------------------------------------------------------ E: what runs which way

  /** the active transfer direction, respecting active hold lock and wheel flip when both directions are possible */
  private wayAt(dev: WaterThing): { into: boolean; src: Vessel; dst: Vessel } | null {
    const hv = this.heldV();
    if (!hv) return null;
    if (this.flipDev !== dev) {
      this.flipDev = dev;
      this.flip = false;
    }
    const ov = dev.vessel();
    if (this.activeLock && this.activeLock.dev === dev) {
      const into = this.activeLock.into;
      return into ? { into, src: ov, dst: hv } : { into, src: hv, dst: ov };
    }
    let into = intoHands(hv, ov);
    if (this.flip) {
      const altInto = !into;
      const altSrc = altInto ? ov : hv;
      const altDst = altInto ? hv : ov;
      if (flowWhy(altSrc, altDst, false) === 'ok') into = altInto;
    }
    return into ? { into, src: ov, dst: hv } : { into, src: hv, dst: ov };
  }

  /** the sponge in the hands, if that is what they hold */
  spongeHeld(): { life?: number } | null {
    const h = this.ctx?.player.held;
    return h?.kind === 'tool' && h.tool.kind === 'sponge' ? h.tool : null;
  }

  /** why a sponge cannot be rinsed in this (null: it can) */
  private rinseWhy(dev: WaterThing, sp: { life?: number }): string | null {
    if (!(dev instanceof VesselThing) || dev.ly.l.item?.item !== 'nd_bucket') return '只能在水桶里洗';
    const v = dev.ly.v;
    if (v.litres < 0.01) return '桶里没水';
    if (v.liquid !== 'water') return '桶里装的不是水';
    if ((sp.life ?? 1) >= 0.999) return '海绵是干净的';
    return null;
  }

  holdAt(dev: WaterThing): number | undefined {
    const sp = this.spongeHeld();
    if (sp) {
      if (this.rinseWhy(dev, sp)) return undefined;
      const v = (dev as VesselThing).ly.v;
      if (this.time - dev.pourAt > 0.25 || !dev.holdLen) dev.holdLen = Math.max(0.25, Math.min((1 - (sp.life ?? 1)) / RINSE, v.litres / RINSE_L));
      return dev.holdLen;
    }
    const w = this.wayAt(dev);
    if (!w || flowWhy(w.src, w.dst) !== 'ok') return undefined;
    // (the hold's length set as it begins: what runs then at the pouring one's speed — not shrinking as it runs)
    if (this.time - dev.pourAt > 0.25 || !dev.holdLen) dev.holdLen = Math.max(0.25, pourS(w.src, w.dst));
    return dev.holdLen;
  }

  holdingAt(dev: WaterThing, k: number): void {
    const sp = this.spongeHeld();
    if (sp && dev instanceof VesselThing) {
      if (k < dev.pourK || this.time - dev.pourAt > 0.25) dev.pourK = 0;
      const dt = Math.max(0, k - dev.pourK) * (dev.holdLen || 0);
      dev.pourK = k;
      dev.pourAt = this.time;
      if (this.rinseWhy(dev, sp)) return;
      // (as much as the water there is: a short bucket rinses it only that far)
      const v = dev.ly.v;
      const l = Math.min(v.litres, RINSE_L * dt);
      v.litres -= l;
      sp.life = Math.min(1, (sp.life ?? 1) + (RINSE * l) / RINSE_L);
      this.ctx!.loose.touch(dev.ly.l);
      this.ctx!.sound('scrub');
      return;
    }
    const fresh = k < dev.pourK || this.time - dev.pourAt > 0.25 || this.activeLock?.dev !== dev;
    if (fresh) {
      dev.pourK = 0;
      this.activeLock = null;
    }
    const w = this.wayAt(dev);
    if (!w) return;
    if (!this.activeLock) this.activeLock = { dev, into: w.into, done: false };
    if (this.activeLock.done) {
      dev.pourAt = this.time;
      return;
    }
    if (flowWhy(w.src, w.dst) !== 'ok') {
      this.activeLock.done = true;
      this.running = null;
      dev.pourAt = this.time;
      return;
    }
    const dk = Math.max(0, k - dev.pourK);
    dev.pourK = k;
    dev.pourAt = this.time;
    this.run(dev, w.into, w.src, w.dst, dk * (dev.holdLen || 0));
    if (flowWhy(w.src, w.dst) !== 'ok') {
      this.activeLock.done = true;
      this.running = null;
    }
  }

  /** liquid run for dt (s) between the hands and a device, shown */
  private run(dev: WaterThing, into: boolean, src: Vessel, dst: Vessel, dt: number): void {
    const q = src.liquid;
    const moved = pour(src, dst, dt);
    if (moved > 0) {
      this.poured += moved;
      // (what lies about and has changed is one's own from now on: places.ts)
      if (dev instanceof VesselThing) this.ctx!.loose.touch(dev.ly.l);
    }
    this.running = { from: dev, into, at: this.time, liquid: q };
  }

  takeAt(dev: WaterThing, held: NonNullable<Held>): { ok: boolean; word: Text } | null {
    const sp = this.spongeHeld();
    if (sp) {
      const why = this.rinseWhy(dev, sp);
      return why ? { ok: false, word: T(why, 'Rinse the sponge') } : null;
    }
    const w = this.wayAt(dev);
    if (!w) return null;
    const why = flowWhy(w.src, w.dst);
    if (why === 'ok') return null;
    return { ok: false, word: T(this.whyWord(dev, held, w.into, why), 'It will not run') };
  }

  private whyWord(dev: WaterThing, held: NonNullable<Held>, into: boolean, why: Exclude<FlowWhy, 'ok'>): string {
    const there = dev instanceof VesselThing ? nameOf(dev.ly.l) : '水泵';
    const mine = heldNameOf(held);
    if (why === 'empty') return into ? `${there}${dev instanceof PumpThing ? '抽干了' : '是空的'}` : `${mine}是空的`;
    if (why === 'full') return into ? `${mine}满了` : `${there}满了`;
    if (why === 'other') return WHY.other;
    return `${there}${WHY[why]}`;
  }

  wordAt(dev: WaterThing): Text {
    const h = this.ctx?.player.held;
    const w = this.wayAt(dev);
    if (dev instanceof PumpThing) {
      const l = dev.pm.v.litres;
      if (!w || !h) return T('接水', 'Pump water');
      return T('接水', 'Pump water');
    }
    const ly = (dev as VesselThing).ly;
    const name = nameOf(ly.l);
    const sp = this.spongeHeld();
    if (sp && ly.l.item?.item === 'nd_bucket') return T('洗海绵', 'Rinse the sponge');
    if (!w || !h) return T(`拿起 <b>${name}</b>`, `Pick up the ${name}`);
    return w.into ? T('灌水', 'Fill from it') : T(`倒进 <b>${name}</b>`, 'Pour into it');
  }

  // ------------------------------------------------------------------ Wheel flips direction; E also transfers

  private aimedWater(h: NonNullable<Held>): WaterThing | null {
    const t = this.ctx?.player.target;
    if (!t || t.kind !== 'device' || !(t.device instanceof WaterThing)) return null;
    if (!this.heldV() || this.ctx!.player.held !== h) return null;
    return t.device;
  }

  private canFlip(h: NonNullable<Held>): boolean {
    const dev = this.aimedWater(h);
    const hv = this.heldV();
    if (!dev || !hv) return false;
    const ov = dev.vessel();
    return flowWhy(hv, ov, false) === 'ok' && flowWhy(ov, hv, false) === 'ok';
  }

  private handStep(h: NonNullable<Held>, dt: number, e: boolean): void {
    if (!e) {
      if (this.eHoldWas) {
        this.eHoldWas = false;
        this.activeLock = null;
      }
      return;
    }
    const dev = this.aimedWater(h);
    if (!dev) return;
    if (!this.eHoldWas || this.activeLock?.dev !== dev) {
      this.eHoldWas = true;
      this.activeLock = null;
    }
    const w = this.wayAt(dev);
    if (!w) return;
    if (!this.activeLock) this.activeLock = { dev, into: w.into, done: false };
    if (this.activeLock.done) return;
    if (flowWhy(w.src, w.dst) !== 'ok') {
      this.activeLock.done = true;
      this.running = null;
      return;
    }
    this.run(dev, w.into, w.src, w.dst, dt);
    if (flowWhy(w.src, w.dst) !== 'ok') {
      this.activeLock.done = true;
      this.running = null;
    }
  }

  private handWords(h: NonNullable<Held>): Action[] {
    if (!this.canFlip(h)) return [];
    return [{ keys: ['Wheel'], text: '切换倒/抽方向' }];
  }

  // ------------------------------------------------------------------ the frame

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    // Keep pour direction lock alive for the entire continuous hold (LMB OR E) so full-cup never auto-reverses (#2)
    const heldDown = this.eHoldWas || ctx.player.primary;
    if (this.activeLock) {
      const ch = ctx.player.held;
      if (!heldDown || !ch || ch.kind !== 'item') this.activeLock = null;
    }
    // the one in the hands, first seen: as it was found (by its own id)
    const h = ctx.player.held;
    if (h?.kind === 'item' && VESSELS[h.item.item]?.found && !h.item.state?.found) foundFill(h.item, hashStr(h.item.uid));
    // the rain on what is left out
    const rain = ctx.env.state.rain ?? 0;
    for (const ly of this.lying.values()) {
      if (ly.catcher) {
        const got = catchRain(ly.catcher, ly.v, ly.rainMin, rain, dt, !ly.l.shut, () => this.sheltered(ly));
        if (got > 0) {
          this.caught += got;
          if (!ly.wet) {
            ly.wet = true;
            ctx.loose.touch(ly.l);
          }
        }
      }
      if (ly.open.open) this.drawLevel(ly);
    }
    // the pumps' handles: rocking while one gives
    const r = this.running && this.time - this.running.at < SHOW_S ? this.running : null;
    for (const p of this.pumps.values()) this.rock(p, r?.from === p.thing, dt);
    this.show(r, dt, ctx);
  }

  /** anything over its mouth (a roof, a vehicle, a table): Nomad Drive's line straight up from it, sixty metres */
  private sheltered(ly: Lying): boolean {
    const ctx = this.ctx!;
    const l = ly.l;
    const top = l.y + ly.open.mouth.y;
    // (the world's own buildings and canopies; an ND building is looked at for its roof itself)
    const cover = ctx.world?.sites.coverAt(l.x, top + 0.05, l.z);
    if (cover && cover.kind !== 'prefab') return true;
    const o = ctx.core.origin;
    // (from a little over its mouth: its own bail and rim are not a roof)
    this.a.set(l.x - o.x, top + 0.15 - o.y, l.z - o.z);
    this.ray.set(this.a, Y);
    this.ray.far = RAIN.skyM;
    const objs: THREE.Object3D[] = [];
    for (const c of ctx.core.scene.children) if (c.name.startsWith('nd-build:')) objs.push(c);
    for (const v of ctx.vehicles) if (Math.hypot(v.sim.px - l.x, v.sim.pz - l.z) < 14) objs.push(v.view.root);
    objs.push(ctx.loose.root);
    this.hits.length = 0;
    this.ray.intersectObjects(objs, true, this.hits);
    for (const hit of this.hits) {
      if (!hit.object.visible) continue;
      // (not itself)
      let own = false;
      for (let x: THREE.Object3D | null = hit.object; x; x = x.parent) if (x === l.obj) own = true;
      if (!own) return true;
    }
    return false;
  }

  private drawLevel(ly: Lying): void {
    const v = ly.v;
    const q = v.liquid;
    const fill = v.holds > 0 ? Math.max(0, Math.min(1, v.litres / v.holds)) : 0;
    if (!q || fill < 0.004) {
      if (ly.disc) ly.disc.visible = false;
      return;
    }
    const o = ly.open;
    if (!ly.disc) {
      const geo = o.glass
        ? (this.cylGeo ??= new THREE.CylinderGeometry(1, 1, 1, 24).translate(0, 0.5, 0))
        : (this.discGeo ??= new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2));
      ly.disc = new THREE.Mesh(geo, this.matOf(q));
      ly.disc.name = 'nd-water:level';
      extraOf(ly.l).add(ly.disc);
    }
    const d = ly.disc;
    d.visible = true;
    d.material = this.matOf(q);
    if (o.glass) {
      const r = o.rBottom;
      d.scale.set(r, Math.max(0.004, 0.09 * fill), r);
      d.position.set(o.mouth.x, o.bottom, o.mouth.z);
    } else {
      const r = o.rBottom + (o.rTop - o.rBottom) * fill;
      d.scale.set(r, 1, r);
      d.position.set(o.mouth.x, o.bottom + (o.mouth.y - 0.006 - o.bottom) * fill, o.mouth.z);
    }
  }

  private matOf(q: DrinkLiquid): THREE.Material {
    let m = this.mats.get(q);
    if (!m) {
      m = surfaceMaterial({ color: LIQUID[q].hex, spec: 0.12, cabinLift: true });
      m.side = THREE.DoubleSide;
      this.mats.set(q, m);
    }
    return m;
  }

  /** a pump's handle as it is (Nomad Drive's: thirty degrees down and back every 0.9 s while it gives) */
  private rock(p: Pump, pumping: boolean, dt: number): void {
    const model = modelOf(p.l);
    if (model !== p.model) {
      p.model = model;
      p.obj = model?.getObjectByName('LEVER') ?? null;
      if (p.obj) p.q0.copy(p.obj.quaternion);
      if (model) p.spout.copy(markerOf(model, 'M_spout', p.spout));
    }
    const a = handleStep(p.handle, pumping, dt);
    if (!p.obj) return;
    this.qa.setFromAxisAngle(Z, (a * Math.PI) / 180);
    p.obj.quaternion.copy(p.q0).multiply(this.qa);
  }

  /** the liquid running: the vessel in the hands gone over to it, the stream, the sound; nothing when none runs */
  private show(r: Running | null, dt: number, ctx: GameContext): void {
    const held = ctx.player.held;
    if (!r || !held) {
      this.unpin();
      this.stream?.update(dt, null, this.a, 0, 1);
      return;
    }
    this.stream ??= new LiquidStream(ctx.core.scene);
    const hk = heldKey(held);
    const ho = openingsOf(held);
    const eye = ctx.player.eye;
    const o = ctx.core.origin;
    const colour = r.liquid ? LIQUID[r.liquid].hex : LIQUID.water.hex;
    let from: THREE.Vector3 | null = null;
    const to = this.b;
    if (r.from instanceof PumpThing) {
      // under the spout: upright, its mouth beneath it (a wide one standing out from the pump's stand), the handle rocking
      const p = r.from.pm;
      const spout = this.c.copy(p.spout);
      (p.model ?? p.l.obj).localToWorld(spout);
      const fx = Math.cos(p.l.yaw);
      const fz = Math.sin(p.l.yaw);
      this.qa.setFromAxisAngle(Y, Math.atan2(fz, -fx));
      this.pinP.set(spout.x + fx * ho.catchOff, spout.y - 0.09, spout.z + fz * ho.catchOff);
      this.pin(this.pinP, this.qa, ho.mouth);
      from = this.a.copy(spout);
      to.copy(this.pinP);
    } else {
      const ly = r.from instanceof VesselThing ? r.from.ly : null;
      const mouth = this.c;
      if (ly) {
        mouth.copy(ly.open.mouth);
        ly.l.obj.localToWorld(mouth);
      } else mouth.copy((r.from as { mouth: THREE.Vector3 }).mouth);
      // (from the eye to it, on the level)
      let dx = mouth.x - (eye.x - o.x);
      let dz = mouth.z - (eye.z - o.z);
      const n = Math.hypot(dx, dz) || 1;
      dx /= n;
      dz /= n;
      // (its spout side turned across the view so it visibly tips from its spout, not its handle)
      const spoutNegX = ho.spout.x < -0.01;
      this.qa.setFromAxisAngle(Y, Math.atan2(-dx, -dz) + (spoutNegX ? Math.PI : 0));
      if (!r.into) {
        // tipped over its mouth, the stream from its spout down into it
        this.qb.setFromAxisAngle(Z, (TIP[hk] ?? 1.1) * (spoutNegX ? 1 : -1));
        this.pinQ.copy(this.qa).multiply(this.qb);
        const dropH = ly?.open.rTop && ly.open.rTop < 0.07 ? 0.095 : 0.14;
        this.pinP.set(mouth.x - dx * 0.02, mouth.y + dropH, mouth.z - dz * 0.02);
        this.pin(this.pinP, this.pinQ, ho.spout);
        from = this.a.copy(this.pinP);
        to.copy(mouth);
        if (ly?.open.open) to.y = mouth.y - (ly.open.mouth.y - ly.open.bottom) * (1 - (ly.v.holds > 0 ? ly.v.litres / ly.v.holds : 0));
      } else {
        // dipped into it, leaning in
        this.qb.setFromAxisAngle(Z, spoutNegX ? 0.5 : -0.5);
        this.pinQ.copy(this.qa).multiply(this.qb);
        this.pinP.set(mouth.x - dx * 0.04, mouth.y + 0.03, mouth.z - dz * 0.04);
        this.pin(this.pinP, this.pinQ, ho.mouth);
      }
    }
    this.stream.update(dt, from, to, colour, 1);
    ctx.sound('pour_water');
  }

  private pin(pos: THREE.Vector3, q: THREE.Quaternion, at: THREE.Vector3): void {
    const ht = this.ctx!.heldThing;
    const model = ht.model;
    const mk = model ? markerOf(model, at === openingsOf(this.ctx!.player.held).spout ? 'M_spout' : 'M_mouth', at) : at;
    ht.pinFor({ pos: pos.clone(), q: q.clone(), at: mk });
    this.pinned = true;
  }

  private unpin(): void {
    if (!this.pinned) return;
    this.pinned = false;
    this.ctx?.heldThing.pinFor(null);
  }

  // ------------------------------------------------------------------ what the mark finds, what one walks into

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const ly of this.lying.values()) {
      const dx = ly.l.x - at.x;
      const dz = ly.l.z - at.z;
      const rr = r + ly.thing.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(ly.thing);
    }
    for (const p of this.pumps.values()) {
      const dx = p.l.x - at.x;
      const dz = p.l.z - at.z;
      const rr = r + p.thing.radius;
      if (dx * dx + dz * dz <= rr * rr) out.push(p.thing);
    }
  }

  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const p of this.pumps.values()) if (solidWithin(p.solid, x, z, r)) out.push(p.solid);
  }

  pickUp(l: Loose): void {
    if (!this.ctx!.player.takeLoose(l)) this.ctx!.player.flashWhy('手满了');
  }

  /** why, in a few words over the hotbar for a moment (the player's flashWhy) */
  flash(s: string): void {
    this.ctx?.player.flashWhy(s);
  }

  say(s: string): void {
    this.ctx?.ui.say(s, 2.4);
  }

  telemetry(): Record<string, unknown> {
    return {
      vessels: this.lying.size,
      pumps: [...this.pumps.values()].map((p) => ({ key: p.key, litres: Math.round(p.v.litres * 100) / 100 })),
      poured: Math.round(this.poured * 1000) / 1000,
      caught: Math.round(this.caught * 1000) / 1000,
    };
  }

  readonly harness = {
    /** the vessels lying about: what, how full, of what, the rain's on it */
    vessels: (): { uid: string; item: string; x: number; y: number; z: number; litres: number; holds: number; liquid: string | null; status: string; rain: number }[] =>
      [...this.lying.values()].map((ly) => ({
        uid: ly.l.uid,
        item: keyOf(ly.l),
        x: ly.l.x,
        y: ly.l.y,
        z: ly.l.z,
        litres: ly.v.litres,
        holds: ly.v.holds,
        liquid: ly.v.liquid,
        status: ly.catcher?.status ?? '-',
        rain: ly.catcher?.rain ?? 0,
      })),
    /** the pumps: where, how much is left, the handle's angle, the spout (world) */
    pumps: (): { key: string; uid: string; x: number; y: number; z: number; yaw: number; litres: number; angle: number; spout: { x: number; y: number; z: number } }[] =>
      [...this.pumps.values()].map((p) => {
        const s = p.spout.clone();
        (p.model ?? p.l.obj).localToWorld(s);
        const o = this.ctx!.core.origin;
        return { key: p.key, uid: p.l.uid, x: p.l.x, y: p.l.y, z: p.l.z, yaw: p.l.yaw, litres: p.v.litres, angle: p.handle.angle, spout: { x: s.x + o.x, y: s.y + o.y, z: s.z + o.z } };
      }),
    /** a vessel's mouth (world) */
    mouth: (uid: string): { x: number; y: number; z: number } | null => {
      const ly = [...this.lying.values()].find((x) => x.l.uid === uid);
      if (!ly) return null;
      const m = ly.open.mouth.clone();
      ly.l.obj.localToWorld(m);
      const o = this.ctx!.core.origin;
      return { x: m.x + o.x, y: m.y + o.y, z: m.z + o.z };
    },
    /** what runs and caught so far */
    totals: (): { poured: number; caught: number } => ({ poured: this.poured, caught: this.caught }),
    /** a pump's water set (a test) */
    setPump: (key: string, litres: number): void => void this.left.set(key, litres),
  };

  dispose(): void {
    this.unpin();
    this.stream?.dispose();
    for (const ly of this.lying.values()) ly.disc?.removeFromParent();
    this.discGeo?.dispose();
    this.cylGeo?.dispose();
    for (const m of this.mats.values()) m.dispose();
  }
}
