/**
 * The places on a vehicle where its operations are done by hand (docs/VEHICLE_SYSTEMS.md §7.3):
 * each wheel, the engine, radiator and battery under the bonnet, the suspension and the brakes at
 * the front wheel arches, the two option mounts, the cold kit, the spare carrier. Ported from
 * Pacific Drive (a part is fitted at its own place on the car) and Drive Beyond Horizons (open the
 * bonnet, the parts are there) — no menus.
 *
 * `placeAction` says what holding E at a place does now, given what the person holds: the operation,
 * the one word under the crosshair, how long it takes — or, when it cannot be done, the one thing that
 * is missing ("缺千斤顶"). Pure; the game turns it into interactables (src/game/systems/carPlaces.ts).
 */
import { catalogItem, type SlotId } from './partsCatalog';
import { planOp, type Inventory, type OpRequest } from './ops';
import { TUNE, type VehicleSystems } from './systems';

export const PLACES = ['wheel0', 'wheel1', 'wheel2', 'wheel3', 'engine', 'cooling', 'battery', 'heater', 'suspension', 'brakes', 'optA', 'optB', 'spare'] as const;
export type PlaceId = (typeof PLACES)[number];

/** the places one reaches only with the bonnet up */
export const UNDER_BONNET: ReadonlySet<PlaceId> = new Set(['engine', 'cooling', 'battery', 'heater']);

export interface PlaceCtx {
  inv: Inventory;
  /** what is in the hands of the one at the place */
  hands: { readonly id: string | null };
  people?: number;
  /** a workbench within reach (a garage, some camps): repairs go to full */
  workbench?: boolean;
  /** another running vehicle alongside (jump leads) */
  donor?: boolean;
  /** the bonnet is up (for the places under it); vehicles without a bonnet mover: always true */
  bonnetOpen?: boolean;
}

export interface PlaceAction {
  /** the operation holding E would do (also when it cannot be done now: then `ok` is false) */
  req: OpRequest | null;
  ok: boolean;
  /** one word under the crosshair: what it does, or the one thing missing; null = nothing here now */
  word: string | null;
  seconds: number;
}

/** the one thing missing, in a word or two, from planOp's reason code */
const MISSING: Record<string, string> = {
  no_jack: '缺千斤顶',
  no_wrench: '缺扳手',
  no_kit: '缺修理包',
  no_plug: '缺补胎条',
  no_spare: '没有备胎',
  not_secured: '先拉手刹',
  engine_running: '先熄火',
  moving: '先停车',
  hands_full: '手上有东西',
  slot_full: '先拆下旧的',
  missing_item: '缺零件',
  not_a_tyre: '缺轮胎',
  shredded: '胎烂了',
  no_pack: '缺应急电源',
  pack_empty: '电源没电',
  no_leads: '缺搭电线',
  no_donor: '要另一辆车',
  no_battery: '没装电瓶',
  no_chains: '缺防滑链',
};

const SLOT_WORD: Partial<Record<SlotId, string>> = {
  engine: '缺发动机',
  cooling: '缺散热器',
  battery: '缺电瓶',
  suspension: '缺悬挂',
  brakes: '缺刹车片',
};

function decide(sys: VehicleSystems, req: OpRequest, ctx: PlaceCtx, word: string): PlaceAction {
  const plan = planOp(sys, req, { inv: ctx.inv, people: ctx.people, donor: ctx.donor, handsFree: ctx.hands.id === null });
  if (plan.ok) return { req, ok: true, word, seconds: plan.seconds };
  const code = plan.reason?.code ?? '';
  if (code === 'fine') return { req: null, ok: false, word: null, seconds: 0 };
  return { req, ok: false, word: MISSING[code] ?? plan.reason?.zh ?? null, seconds: 0 };
}

const NOTHING: PlaceAction = { req: null, ok: false, word: null, seconds: 0 };

export function placeAction(sys: VehicleSystems, place: PlaceId, ctx: PlaceCtx): PlaceAction {
  const s = sys.state;
  const held = ctx.hands.id ? catalogItem(ctx.hands.id) : undefined;
  if (place.startsWith('wheel')) {
    const i = Number(place[5]);
    const w = s.wheels[i];
    if (!w) return NOTHING;
    if (w.off) {
      if (held?.kind === 'tyre') return decide(sys, { kind: 'fitWheel', wheel: i, item: held.id }, ctx, '装轮');
      return { req: null, ok: false, word: '缺轮胎', seconds: 0 };
    }
    if (held?.kind === 'tyre' && held.id !== w.tyre) return decide(sys, { kind: 'fitTyre', wheel: i, item: held.id }, ctx, '换胎');
    if (held?.id === 'acc.chains') return decide(sys, { kind: 'chains', on: true }, ctx, '装防滑链');
    if (w.flat) {
      if (s.spare && !s.spare.flat) return decide(sys, { kind: 'changeWheel', wheel: i }, ctx, '换备胎');
      if (ctx.inv.count('tool.tyreplug') > 0 && w.tread > 0) return decide(sys, { kind: 'patchTyre', wheel: i }, ctx, '补胎');
    }
    if (w.chains && !held) return decide(sys, { kind: 'chains', on: false }, ctx, '卸防滑链');
    if (!held) return decide(sys, { kind: 'removeWheel', wheel: i }, ctx, '拆轮');
    return NOTHING;
  }
  if (place === 'spare') {
    if (s.spare) {
      if (s.spare.flat && ctx.inv.count('tool.tyreplug') > 0) return decide(sys, { kind: 'patchTyre', wheel: 'spare' }, ctx, '补胎');
      if (!held) return decide(sys, { kind: 'takeSpare' }, ctx, '取备胎');
      return NOTHING;
    }
    if (held?.kind === 'tyre') return decide(sys, { kind: 'stowSpare', item: held.id }, ctx, '放上备胎');
    return NOTHING;
  }
  const slot = place as SlotId;
  if (UNDER_BONNET.has(place) && ctx.bonnetOpen === false) return { req: null, ok: false, word: '开引擎盖', seconds: 0 };
  const part = s.slots[slot] ?? null;
  // the battery's terminals: a flat one is jumped first
  if (slot === 'battery' && part && s.battery < TUNE.minCrankCharge) {
    if (ctx.inv.count('tool.jumppack') > 0) return decide(sys, { kind: 'jumpStart', source: 'pack' }, ctx, '搭电');
    if (ctx.inv.count('tool.jumpleads') > 0) return decide(sys, { kind: 'jumpStart', source: 'leads' }, ctx, '搭电');
  }
  if (held?.kind === 'part' && held.slot === slot) return decide(sys, { kind: 'install', item: held.id }, ctx, '装上');
  if (!part) {
    if (held) return NOTHING;
    return { req: null, ok: false, word: SLOT_WORD[slot] ?? null, seconds: 0 };
  }
  if (part.cond < 100 && ctx.inv.count('tool.repairkit') > 0 && slot !== 'optA' && slot !== 'optB' && slot !== 'heater')
    return decide(sys, { kind: 'repair', slot, at: ctx.workbench ? 'workbench' : 'roadside' }, ctx, '修理');
  if (!held) return decide(sys, { kind: 'remove', slot }, ctx, '拆下');
  return NOTHING;
}
