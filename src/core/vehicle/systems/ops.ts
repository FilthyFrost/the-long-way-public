/**
 * Repair and modification as pure operations with preconditions and durations
 * (docs/VEHICLE_SYSTEMS.md §7). `planOp` says whether an operation can be done now, how long it takes and
 * what it uses up; `applyOp` does it (call it when the player's hold-to-do ring completes). The inventory
 * is an interface: the lead's item system will implement it; SimpleInventory serves the tests.
 */
import { clamp } from '../../math/util';
import { catalogItem, type SlotId, type TyreId } from './partsCatalog';
import { TUNE, type VehicleSystems, type WheelState } from './systems';

/** an item instance: parts carry their condition, cans their litres */
export interface ItemInstance {
  id: string;
  cond?: number;
  litres?: number;
  /** a wheel whose tyre is punctured */
  flat?: boolean;
}

export interface Inventory {
  count(id: string): number;
  /** remove one instance (the best-conditioned first); undefined if none */
  take(id: string): ItemInstance | undefined;
  give(item: ItemInstance): void;
  /** optional: the instance `take` would give, without taking it (to refuse an empty pack, a dry can) */
  peek?(id: string): ItemInstance | undefined;
}

export class SimpleInventory implements Inventory {
  items: ItemInstance[] = [];
  constructor(items: (ItemInstance | string)[] = []) {
    for (const it of items) this.items.push(typeof it === 'string' ? { id: it } : it);
  }
  count(id: string): number {
    return this.items.filter((i) => i.id === id).length;
  }
  take(id: string): ItemInstance | undefined {
    let best = -1;
    for (let i = 0; i < this.items.length; i++) if (this.items[i].id === id && (best < 0 || (this.items[i].cond ?? 100) > (this.items[best].cond ?? 100))) best = i;
    return best < 0 ? undefined : this.items.splice(best, 1)[0];
  }
  give(item: ItemInstance): void {
    this.items.push(item);
  }
  peek(id: string): ItemInstance | undefined {
    const got = this.take(id);
    if (got) this.items.push(got);
    return got;
  }
}

export type OpRequest =
  | { kind: 'install'; item: string }
  | { kind: 'remove'; slot: SlotId }
  | { kind: 'repair'; slot: SlotId | 'wheel'; wheel?: number; at?: 'roadside' | 'workbench' }
  | { kind: 'changeWheel'; wheel: number }
  | { kind: 'removeWheel'; wheel: number }
  | { kind: 'fitWheel'; wheel: number; item: string }
  | { kind: 'takeSpare' }
  | { kind: 'stowSpare'; item: string }
  | { kind: 'fitTyre'; wheel: number; item: string }
  | { kind: 'patchTyre'; wheel: number | 'spare' }
  | { kind: 'chains'; on: boolean }
  | { kind: 'refuel'; source: 'pump' | 'can'; litres?: number }
  | { kind: 'siphon'; litres: number }
  | { kind: 'coolant'; item: 'fluid.coolant' | 'drink.water' }
  | { kind: 'jumpStart'; source: 'leads' | 'pack' }
  | { kind: 'charge'; units?: number };

export interface OpContext {
  inv: Inventory;
  /** people working on it (1 = alone); two halve most jobs */
  people?: number;
  /** another running vehicle is parked alongside (jump leads) */
  donor?: boolean;
  /** the hands of the one doing it are free (to take a wheel off into them); default true */
  handsFree?: boolean;
}

export interface OpPlan {
  ok: boolean;
  /** why not (stable code + one sentence each language) */
  reason?: { code: string; zh: string; en: string };
  /** how long the hold lasts (s) */
  seconds: number;
}

/** a part found without a recorded condition (a loot roll gives none): used, not new */
export const FOUND_COND = 65;

const NO = (code: string, zh: string, en: string): OpPlan => ({ ok: false, reason: { code, zh, en }, seconds: 0 });
const SIZE_S = { small: 6, medium: 15, large: 40 } as const;

function stopped(sys: VehicleSystems): boolean {
  return !sys.sim || sys.sim.speed < 0.3;
}
function secured(sys: VehicleSystems): boolean {
  const sim = sys.sim;
  return !sim || sim.parkBrake > 0 || sim.selector === 'P' || sim.hold;
}
const helpers = (ctx: OpContext): number => Math.max(1, ctx.people ?? 1);

export function planOp(sys: VehicleSystems, req: OpRequest, ctx: OpContext): OpPlan {
  const s = sys.state;
  const inv = ctx.inv;
  const two = helpers(ctx) >= 2;
  if (!stopped(sys) && req.kind !== 'refuel') return NO('moving', '先停车。', 'Stop the vehicle first.');
  switch (req.kind) {
    case 'install': {
      const it = catalogItem(req.item);
      if (!it || it.kind !== 'part' || !it.slot) return NO('not_a_part', '这不是车上的零件。', 'That is not a vehicle part.');
      if (it.slot === 'body') return NO('body', '车身不能换。', 'The body cannot be swapped.');
      if (inv.count(req.item) < 1) return NO('missing_item', '手上没有这个零件。', 'You do not have that part.');
      if (s.slots[it.slot]) return NO('slot_full', '这个位置已经装了东西，先拆下来。', 'Something is fitted there; take it out first.');
      if ((it.slot === 'engine' || it.slot === 'cooling' || it.slot === 'battery') && s.running) return NO('engine_running', '先熄火。', 'Switch the engine off first.');
      const base = SIZE_S[it.size];
      return { ok: true, seconds: it.size === 'large' ? (two ? base * 0.4 : base) : two ? base * 0.6 : base };
    }
    case 'remove': {
      const p = s.slots[req.slot];
      if (!p) return NO('slot_empty', '这里是空的。', 'Nothing is fitted there.');
      if (req.slot === 'body') return NO('body', '车身不能拆。', 'The body cannot be removed.');
      if (s.running) return NO('engine_running', '先熄火。', 'Switch the engine off first.');
      const it = catalogItem(p.id);
      const base = SIZE_S[it?.size ?? 'medium'] * 0.7;
      return { ok: true, seconds: two ? base * 0.5 : base };
    }
    case 'repair': {
      const atBench = req.at === 'workbench';
      if (inv.count('tool.repairkit') < 1) return NO('no_kit', '没有修理包。', 'No repair kit.');
      if (req.slot === 'wheel') {
        const w = s.wheels[req.wheel ?? -1];
        if (!w) return NO('no_wheel', '没有这只轮子。', 'No such wheel.');
        if (w.rim >= 100) return NO('fine', '轮毂好好的。', 'The rim is fine.');
        return { ok: true, seconds: 12 };
      }
      const p = s.slots[req.slot];
      if (!p) return NO('slot_empty', '这里是空的。', 'Nothing is fitted there.');
      if (p.cond >= 100) return NO('fine', '它好好的。', 'It is fine.');
      if ((req.slot === 'engine' || req.slot === 'cooling') && s.running) return NO('engine_running', '先熄火。', 'Switch the engine off first.');
      return { ok: true, seconds: (atBench ? 25 : 12) * (two ? 0.6 : 1) };
    }
    case 'removeWheel': {
      const w = s.wheels[req.wheel];
      if (!w || w.off) return NO('no_wheel', '这里没有轮子。', 'There is no wheel here.');
      if (!secured(sys)) return NO('not_secured', '先拉手刹或挂 P 挡。', 'Pull the handbrake or select P first.');
      if (inv.count('tool.jack') < 1) return NO('no_jack', '缺千斤顶。', 'You need a jack.');
      if (inv.count('tool.wrench') < 1) return NO('no_wrench', '缺扳手。', 'You need a wheel wrench.');
      if (!ctx.handsFree) return NO('hands_full', '手上拿着东西。', 'Your hands are full.');
      // half of a wheel change: off now, on later (20 s / 8 s together)
      return { ok: true, seconds: two ? 4 : 10 };
    }
    case 'fitWheel': {
      const w = s.wheels[req.wheel];
      if (!w) return NO('no_wheel', '没有这只轮子。', 'No such wheel.');
      if (!w.off) return NO('wheel_on', '轮子在上面。', 'The wheel is on.');
      const it = catalogItem(req.item);
      if (!it || it.kind !== 'tyre') return NO('not_a_tyre', '缺轮胎。', 'You need a wheel.');
      if (inv.count(req.item) < 1) return NO('missing_item', '缺轮胎。', 'You need a wheel.');
      if (inv.count('tool.wrench') < 1) return NO('no_wrench', '缺扳手。', 'You need a wheel wrench.');
      return { ok: true, seconds: two ? 4 : 10 };
    }
    case 'takeSpare': {
      if (!s.spare) return NO('no_spare', '没有备胎。', 'There is no spare.');
      if (!ctx.handsFree) return NO('hands_full', '手上拿着东西。', 'Your hands are full.');
      return { ok: true, seconds: 3 };
    }
    case 'stowSpare': {
      if (s.spare) return NO('slot_full', '备胎架上已经有了。', 'The spare carrier is taken.');
      const it = catalogItem(req.item);
      if (!it || it.kind !== 'tyre' || inv.count(req.item) < 1) return NO('missing_item', '缺轮胎。', 'You need a wheel.');
      return { ok: true, seconds: 3 };
    }
    case 'changeWheel': {
      const w = s.wheels[req.wheel];
      if (!w || w.off) return NO('no_wheel', '没有这只轮子。', 'No such wheel.');
      if (!s.spare) return NO('no_spare', '没有备胎。', 'There is no spare.');
      if (!secured(sys)) return NO('not_secured', '先拉手刹或挂 P 挡。', 'Pull the handbrake or select P first.');
      if (inv.count('tool.jack') < 1) return NO('no_jack', '缺千斤顶。', 'You need a jack.');
      if (inv.count('tool.wrench') < 1) return NO('no_wrench', '缺扳手。', 'You need a wheel wrench.');
      return { ok: true, seconds: two ? 8 : 20 };
    }
    case 'fitTyre': {
      const it = catalogItem(req.item);
      if (!it || it.kind !== 'tyre') return NO('not_a_tyre', '这不是轮胎。', 'That is not a tyre.');
      if (inv.count(req.item) < 1) return NO('missing_item', '手上没有这只轮胎。', 'You do not have that tyre.');
      if (!s.wheels[req.wheel] || s.wheels[req.wheel].off) return NO('no_wheel', '没有这只轮子。', 'No such wheel.');
      if (!secured(sys)) return NO('not_secured', '先拉手刹或挂 P 挡。', 'Pull the handbrake or select P first.');
      if (inv.count('tool.jack') < 1) return NO('no_jack', '缺千斤顶。', 'You need a jack.');
      if (inv.count('tool.wrench') < 1) return NO('no_wrench', '缺扳手。', 'You need a wheel wrench.');
      return { ok: true, seconds: two ? 8 : 20 };
    }
    case 'patchTyre': {
      const w = req.wheel === 'spare' ? s.spare : s.wheels[req.wheel];
      if (!w) return NO('no_wheel', '没有这只轮子。', 'No such wheel.');
      if (!w.flat) return NO('fine', '这只胎没漏气。', 'That tyre is not flat.');
      if (w.tread <= 0) return NO('shredded', '这只胎已经烂了，补不了，得换新的。', 'That tyre is shredded; it needs replacing.');
      if (inv.count('tool.tyreplug') < 1) return NO('no_plug', '没有补胎条。', 'No tyre plugs.');
      return { ok: true, seconds: 25 };
    }
    case 'chains': {
      if (req.on && inv.count('acc.chains') < 1) return NO('no_chains', '没有防滑链。', 'No snow chains.');
      if (req.on === s.wheels[2].chains) return NO('fine', req.on ? '已经装上了。' : '没装链子。', req.on ? 'They are already on.' : 'No chains are fitted.');
      return { ok: true, seconds: two ? 15 : 30 };
    }
    case 'refuel': {
      if (!stopped(sys)) return NO('moving', '先停车。', 'Stop the vehicle first.');
      const room = sys.tankL - s.fuelL;
      if (room < 0.05) return NO('full', '油箱满了。', 'The tank is full.');
      if (req.source === 'can') {
        if (inv.count('fuel.jerrycan') < 1) return NO('no_can', '没有装油的油桶。', 'No jerrycan of petrol.');
        return { ok: true, seconds: (Math.min(10, room) / 10) * 12 };
      }
      const l = Math.min(req.litres ?? room, room);
      return { ok: true, seconds: (l / 10) * 15 };
    }
    case 'siphon': {
      if (inv.count('tool.siphon') < 1) return NO('no_hose', '要一根抽油管。', 'You need a siphon hose.');
      const room = sys.tankL - s.fuelL;
      if (room < 0.05) return NO('full', '油箱满了。', 'The tank is full.');
      return { ok: true, seconds: Math.min(req.litres, room) / 0.25 };
    }
    case 'coolant': {
      if (inv.count(req.item) < 1) return NO('missing_item', req.item === 'drink.water' ? '没有水。' : '没有冷却液。', req.item === 'drink.water' ? 'No water.' : 'No coolant.');
      if (!s.slots.cooling) return NO('no_radiator', '没装散热器。', 'There is no radiator.');
      if (s.coolant >= 0.999 && s.coolantC < TUNE.yellowC) return NO('full', '水箱是满的。', 'The radiator is full.');
      return { ok: true, seconds: 4 };
    }
    case 'jumpStart': {
      if (!s.slots.battery) return NO('no_battery', '没装电瓶。', 'There is no battery.');
      if (req.source === 'leads') {
        if (inv.count('tool.jumpleads') < 1) return NO('no_leads', '没有搭电线。', 'No jump leads.');
        if (!ctx.donor) return NO('no_donor', '要另一辆打着火的车停在旁边。', 'Another running vehicle has to be alongside.');
      } else if (inv.count('tool.jumppack') < 1) return NO('no_pack', '没有应急启动电源。', 'No jump pack.');
      else if ((inv.peek?.('tool.jumppack')?.cond ?? 100) <= 0) return NO('pack_empty', '应急电源没电了。', 'The jump pack is flat.');
      return { ok: true, seconds: 10 };
    }
    case 'charge': {
      if (!s.slots.battery) return NO('no_battery', '没装电瓶。', 'There is no battery.');
      if (s.battery >= sys.batteryCap - 0.5) return NO('full', '电是满的。', 'The battery is full.');
      return { ok: true, seconds: 60 };
    }
  }
}

/** Perform the operation (after the hold completes). Returns the plan; nothing changes when it is not ok. */
export function applyOp(sys: VehicleSystems, req: OpRequest, ctx: OpContext): OpPlan {
  const plan = planOp(sys, req, ctx);
  if (!plan.ok) return plan;
  const s = sys.state;
  const inv = ctx.inv;
  switch (req.kind) {
    case 'install': {
      const it = catalogItem(req.item)!;
      const got = inv.take(req.item)!;
      s.slots[it.slot!] = { id: it.id, cond: got.cond ?? FOUND_COND };
      if (it.slot === 'battery') s.battery = Math.min(s.battery, sys.batteryCap);
      break;
    }
    case 'remove': {
      const p = s.slots[req.slot]!;
      inv.give({ id: p.id, cond: p.cond });
      s.slots[req.slot] = null;
      if (req.slot === 'engine') s.running = false;
      break;
    }
    case 'repair': {
      inv.take('tool.repairkit');
      const amount = req.at === 'workbench' ? 100 : 50;
      if (req.slot === 'wheel') {
        const w = s.wheels[req.wheel!];
        w.rim = clamp(w.rim + amount, 0, 100);
      } else {
        const p = s.slots[req.slot]!;
        p.cond = clamp(p.cond + amount, 0, 100);
      }
      break;
    }
    case 'removeWheel': {
      const w = s.wheels[req.wheel];
      inv.give({ id: w.tyre, cond: Math.round(w.tread * 10) / 10, flat: w.flat });
      w.off = true;
      w.chains = false;
      break;
    }
    case 'fitWheel': {
      const old = s.wheels[req.wheel];
      const got = inv.take(req.item)!;
      s.wheels[req.wheel] = { tyre: req.item as TyreId, tread: got.cond ?? FOUND_COND, flat: !!got.flat, rim: 100, chains: false, seg: old.seg };
      break;
    }
    case 'takeSpare': {
      const sp = s.spare!;
      inv.give({ id: sp.tyre, cond: Math.round(sp.tread * 10) / 10, flat: sp.flat });
      s.spare = null;
      break;
    }
    case 'stowSpare': {
      const got = inv.take(req.item)!;
      s.spare = { tyre: req.item as TyreId, tread: got.cond ?? FOUND_COND, flat: !!got.flat, rim: 100, chains: false, seg: 0 };
      break;
    }
    case 'changeWheel': {
      const off = s.wheels[req.wheel];
      s.wheels[req.wheel] = { ...s.spare!, chains: off.chains, seg: off.seg };
      s.spare = { ...off, chains: false };
      break;
    }
    case 'fitTyre': {
      const off = s.wheels[req.wheel];
      const got = inv.take(req.item)!;
      const fresh: WheelState = { tyre: req.item as TyreId, tread: got.cond ?? FOUND_COND, flat: false, rim: 100, chains: off.chains, seg: off.seg };
      s.wheels[req.wheel] = fresh;
      inv.give({ id: off.tyre, cond: off.flat ? 0 : off.tread });
      break;
    }
    case 'patchTyre': {
      inv.take('tool.tyreplug');
      const w = req.wheel === 'spare' ? s.spare! : s.wheels[req.wheel];
      w.flat = false;
      break;
    }
    case 'chains': {
      if (req.on) inv.take('acc.chains');
      else inv.give({ id: 'acc.chains' });
      // chains go on the driven axle (both axles on a four-wheel drive)
      const spec = sys.spec;
      for (let i = 0; i < 4; i++) if ((i < 2 ? spec.front.driven : spec.rear.driven) || !req.on) s.wheels[i].chains = req.on;
      break;
    }
    case 'refuel': {
      const room = sys.tankL - s.fuelL;
      let l: number;
      if (req.source === 'can') {
        const can = inv.take('fuel.jerrycan')!;
        const held = can.litres ?? 10;
        l = Math.min(held, room);
        // what did not fit stays in the can; an emptied can comes back as an empty jerrycan
        inv.give({ id: 'fuel.jerrycan', litres: Math.max(0, held - l) });
      } else l = Math.min(req.litres ?? room, room);
      s.fuelL += l;
      break;
    }
    case 'siphon': {
      s.fuelL += Math.min(req.litres, sys.tankL - s.fuelL);
      break;
    }
    case 'coolant': {
      inv.take(req.item);
      // water tops up as well, coolant lasts longer (leaks half as fast: modelled as a bigger top-up)
      s.coolant = clamp(s.coolant + (req.item === 'fluid.coolant' ? 0.5 : 0.3), 0, 1);
      s.coolantC = Math.max(ctxAmbient(sys), s.coolantC - 15);
      break;
    }
    case 'jumpStart': {
      s.battery = Math.min(sys.batteryCap, s.battery + 25);
      if (req.source === 'pack') {
        // a pack holds three starts: modelled as a part condition on the item
        const pack = inv.take('tool.jumppack')!;
        const left = (pack.cond ?? 100) - 34;
        if (left > 0) inv.give({ id: 'tool.jumppack', cond: left });
        else inv.give({ id: 'tool.jumppack', cond: 0 });
      }
      break;
    }
    case 'charge': {
      s.battery = Math.min(sys.batteryCap, s.battery + (req.units ?? 65));
      break;
    }
  }
  if (sys.sim) {
    sys.sim.fuelL = Number.isFinite(sys.sim.fuelL) ? s.fuelL : sys.sim.fuelL;
    sys.refreshSpec();
    sys.applyMods();
  }
  return plan;
}

function ctxAmbient(sys: VehicleSystems): number {
  return Math.min(sys.state.coolantC, 20);
}
