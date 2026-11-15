/**
 * Every vehicle-related item as plain data: parts, tyres, fluids and tools (docs/VEHICLE_SYSTEMS.md §6).
 * The ids live in the one item catalogue (src/core/items/catalog.ts): this file registers them there
 * (`registerItems`, at load) and keeps the vehicle's own table — slot, tier, effects — by the same id.
 * Ids the catalogue already has (tool.repairkit, tool.jack, tool.wrench, tool.siphon, tyre.road,
 * part.battery.1) are not registered twice. Ids are stable strings — save games and the network refer to them.
 *
 * size: small = fits in a backpack, medium = carried in the hands, large = needs two people to carry.
 */

import { hasItem, registerItems, type ItemCat, type ItemShape } from '../../items/catalog';

export type SlotId = 'engine' | 'cooling' | 'battery' | 'suspension' | 'brakes' | 'body' | 'optA' | 'optB' | 'heater';
export type ItemKind = 'part' | 'tyre' | 'accessory' | 'fluid' | 'tool';
export type SizeClass = 'small' | 'medium' | 'large';

export interface PartEffects {
  /** engine torque multiplier */
  torque?: number;
  /** fuel per kWh multiplier */
  fuel?: number;
  /** cooling capacity multiplier */
  cooling?: number;
  /** battery capacity (units) */
  batteryCap?: number;
  /** service brake multiplier */
  brake?: number;
  /** wear-rate multiplier for this part */
  wear?: number;
  /** extra fuel tank volume as a share of the vehicle's tank */
  tankExtra?: number;
  /** jerrycans carried outside */
  canSlots?: number;
  /** headlight reach multiplier (for the renderer) */
  lightReach?: number;
  /** no cold-start penalty */
  preheat?: boolean;
  /** cabin heating and demisting */
  cabinHeat?: boolean;
  /** suspension: roll stiffness multiplier, extra travel and ride height (m) — applied when the spec is rebuilt */
  rollStiffness?: number;
  extraTravel?: number;
  extraHeight?: number;
  /** consumable: condition restored */
  repair?: number;
  /** litres held (fluids, full cans) */
  litres?: number;
  /** battery units delivered (jump pack per use) */
  charge?: number;
}

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  zh: string;
  en: string;
  /** slot it goes in (parts) */
  slot?: SlotId;
  tier?: number;
  size: SizeClass;
  /** consumed when used */
  consumable?: boolean;
  effects: PartEffects;
}

const I = (item: CatalogItem): CatalogItem => item;

export const PARTS_CATALOG: readonly CatalogItem[] = [
  // ---- engine (5.5: I stock with a quirk, II rebuilt +10 %, III one size up +22 % torque / +12 % fuel)
  I({ id: 'part.engine.1', kind: 'part', zh: '原装发动机', en: 'Stock engine', slot: 'engine', tier: 1, size: 'large', effects: { torque: 1, fuel: 1 } }),
  I({ id: 'part.engine.2', kind: 'part', zh: '整备发动机', en: 'Rebuilt engine', slot: 'engine', tier: 2, size: 'large', effects: { torque: 1.1, fuel: 1, wear: 0.8 } }),
  I({ id: 'part.engine.3', kind: 'part', zh: '大一号发动机', en: 'Bigger engine', slot: 'engine', tier: 3, size: 'large', effects: { torque: 1.22, fuel: 1.12, wear: 0.9 } }),
  // ---- cooling
  I({ id: 'part.cooling.1', kind: 'part', zh: '原装散热器', en: 'Stock radiator', slot: 'cooling', tier: 1, size: 'medium', effects: { cooling: 1 } }),
  I({ id: 'part.cooling.2', kind: 'part', zh: '加大水箱', en: 'Large radiator', slot: 'cooling', tier: 2, size: 'medium', effects: { cooling: 1.35 } }),
  I({ id: 'part.cooling.3', kind: 'part', zh: '双风扇散热 + 机油冷却', en: 'Twin-fan radiator and oil cooler', slot: 'cooling', tier: 3, size: 'medium', effects: { cooling: 1.8 } }),
  // ---- battery
  I({ id: 'part.battery.1', kind: 'part', zh: '电瓶', en: 'Battery', slot: 'battery', tier: 1, size: 'medium', effects: { batteryCap: 100 } }),
  I({ id: 'part.battery.2', kind: 'part', zh: '大容量电瓶', en: 'Deep-cycle battery', slot: 'battery', tier: 2, size: 'medium', effects: { batteryCap: 150 } }),
  // ---- suspension (II stiffer, III lifted)
  I({ id: 'part.suspension.1', kind: 'part', zh: '原装悬挂', en: 'Stock suspension', slot: 'suspension', tier: 1, size: 'large', effects: {} }),
  I({ id: 'part.suspension.2', kind: 'part', zh: '加强悬挂', en: 'Heavy-duty suspension', slot: 'suspension', tier: 2, size: 'large', effects: { rollStiffness: 1.3, wear: 0.7 } }),
  I({ id: 'part.suspension.3', kind: 'part', zh: '升高悬挂', en: 'Lift kit', slot: 'suspension', tier: 3, size: 'large', effects: { extraTravel: 0.04, extraHeight: 0.05, wear: 0.7 } }),
  // ---- brakes
  I({ id: 'part.brakes.1', kind: 'part', zh: '刹车片', en: 'Brake pads', slot: 'brakes', tier: 1, size: 'small', effects: { brake: 1 } }),
  I({ id: 'part.brakes.2', kind: 'part', zh: '加强刹车片', en: 'Performance pads', slot: 'brakes', tier: 2, size: 'small', effects: { brake: 1.08, wear: 0.7 } }),
  // ---- body: the shell itself, never removed; listed so the catalogue names it
  I({ id: 'part.body', kind: 'part', zh: '车身', en: 'Body', slot: 'body', tier: 1, size: 'large', effects: {} }),
  // ---- options
  I({ id: 'part.tank.aux', kind: 'part', zh: '副油箱', en: 'Auxiliary tank', slot: 'optA', tier: 1, size: 'medium', effects: { tankExtra: 0.5 } }),
  I({ id: 'part.rack.cans', kind: 'part', zh: '油桶架', en: 'Jerrycan rack', slot: 'optA', tier: 1, size: 'medium', effects: { canSlots: 2 } }),
  I({ id: 'part.lights.fog', kind: 'part', zh: '雾灯', en: 'Fog lamps', slot: 'optB', tier: 1, size: 'small', effects: { lightReach: 1.2 } }),
  I({ id: 'part.lights.spot', kind: 'part', zh: '射灯', en: 'Spot lamps', slot: 'optB', tier: 2, size: 'small', effects: { lightReach: 1.5 } }),
  I({ id: 'part.lights.bar', kind: 'part', zh: '车顶灯排', en: 'Roof light bar', slot: 'optB', tier: 3, size: 'medium', effects: { lightReach: 1.9 } }),
  // ---- cold kit (5.5)
  I({ id: 'part.heater.block', kind: 'part', zh: '发动机预热器', en: 'Block heater', slot: 'heater', tier: 1, size: 'small', effects: { preheat: true } }),
  I({ id: 'part.heater.cabin', kind: 'part', zh: '暖风与除霜', en: 'Heater and demister', slot: 'heater', tier: 2, size: 'medium', effects: { preheat: true, cabinHeat: true } }),
  // ---- tyres (a tyre on its rim: a whole wheel)
  I({ id: 'tyre.road', kind: 'tyre', zh: '公路胎', en: 'Road tyre', tier: 1, size: 'medium', effects: {} }),
  I({ id: 'tyre.allterrain', kind: 'tyre', zh: '全地形胎', en: 'All-terrain tyre', tier: 2, size: 'medium', effects: {} }),
  I({ id: 'tyre.mud', kind: 'tyre', zh: '泥地胎', en: 'Mud tyre', tier: 3, size: 'medium', effects: {} }),
  I({ id: 'tyre.snow', kind: 'tyre', zh: '雪地胎', en: 'Snow tyre', tier: 3, size: 'medium', effects: {} }),
  I({ id: 'acc.chains', kind: 'accessory', zh: '防滑链（一套）', en: 'Snow chains (set)', size: 'medium', effects: {} }),
  // ---- fluids (petrol and water travel in the lead's vessels: fuel.jerrycan, fuel.drum, water.canister)
  I({ id: 'fluid.coolant', kind: 'fluid', zh: '冷却液（1 升）', en: 'Coolant (1 L)', size: 'small', consumable: true, effects: { litres: 1 } }),
  // ---- tools
  I({ id: 'tool.repairkit', kind: 'tool', zh: '修理包', en: 'Repair kit', size: 'small', consumable: true, effects: { repair: 50 } }),
  I({ id: 'tool.tyreplug', kind: 'tool', zh: '补胎条', en: 'Tyre plug kit', size: 'small', consumable: true, effects: {} }),
  I({ id: 'tool.jack', kind: 'tool', zh: '千斤顶', en: 'Jack', size: 'medium', effects: {} }),
  I({ id: 'tool.wrench', kind: 'tool', zh: '轮胎扳手', en: 'Wheel wrench', size: 'small', effects: {} }),
  I({ id: 'tool.siphon', kind: 'tool', zh: '抽油管', en: 'Siphon hose', size: 'small', effects: {} }),
  I({ id: 'tool.jumpleads', kind: 'tool', zh: '搭电线', en: 'Jump leads', size: 'small', effects: {} }),
  I({ id: 'tool.jumppack', kind: 'tool', zh: '应急启动电源', en: 'Jump pack', size: 'medium', effects: { charge: 25 } }),
];

const BY_ID = new Map(PARTS_CATALOG.map((i) => [i.id, i]));

export function catalogItem(id: string): CatalogItem | undefined {
  return BY_ID.get(id);
}

export function itemOrThrow(id: string): CatalogItem {
  const it = BY_ID.get(id);
  if (!it) throw new Error(`unknown vehicle item ${id}`);
  return it;
}

/** tyre kinds in the order of the grip table */
export const TYRE_IDS = ['tyre.road', 'tyre.allterrain', 'tyre.mud', 'tyre.snow'] as const;
export type TyreId = (typeof TYRE_IDS)[number];

/**
 * Tyre × surface grip (docs/DESIGN_V2.md §5.5), columns in ground order: asphalt, gravel, dirt, grass,
 * sand, snow, ice. Multiplies the surface's base friction. rr = rolling-resistance multiplier.
 */
export const TYRE_GRIP: Record<TyreId | 'chains', { mu: readonly number[]; rr: number; noise: number; wear: number; puncture: number }> = {
  'tyre.road': { mu: [1.0, 0.92, 0.92, 0.85, 0.8, 1.0, 1.0], rr: 1.0, noise: 0.2, wear: 1.0, puncture: 1.0 },
  'tyre.allterrain': { mu: [0.96, 1.08, 1.08, 1.1, 1.05, 1.05, 1.0], rr: 1.08, noise: 0.45, wear: 1.15, puncture: 0.6 },
  'tyre.mud': { mu: [0.9, 1.15, 1.15, 1.3, 1.25, 1.1, 0.9], rr: 1.18, noise: 0.8, wear: 1.5, puncture: 0.5 },
  'tyre.snow': { mu: [0.94, 1.0, 1.0, 1.0, 0.95, 1.45, 1.6], rr: 1.06, noise: 0.45, wear: 1.3, puncture: 0.9 },
  chains: { mu: [0.8, 1.0, 1.0, 1.1, 1.0, 1.6, 2.2], rr: 1.25, noise: 1.0, wear: 0, puncture: 0.3 },
};

/** how each kind of vehicle item looks and is filed in the one catalogue */
const LOOK: Record<string, { cat: ItemCat; shape: ItemShape; tint: number; stack?: number }> = {
  engine: { cat: 'part', shape: 'machine', tint: 0x5d6064 },
  cooling: { cat: 'part', shape: 'case', tint: 0x8a9aa0 },
  battery: { cat: 'part', shape: 'battery', tint: 0x3f5f8a },
  suspension: { cat: 'part', shape: 'coil', tint: 0x6f5a48 },
  brakes: { cat: 'part', shape: 'case', tint: 0x9a8a7a, stack: 1 },
  body: { cat: 'part', shape: 'machine', tint: 0x7d8588 },
  optA: { cat: 'part', shape: 'drum', tint: 0x3f6f8a },
  optB: { cat: 'part', shape: 'case', tint: 0xd9c86a },
  heater: { cat: 'part', shape: 'case', tint: 0xb5653a },
  tyre: { cat: 'tyre', shape: 'tyre', tint: 0x34363b },
  accessory: { cat: 'part', shape: 'coil', tint: 0x9aa3a6 },
  fluid: { cat: 'fuel', shape: 'bottle', tint: 0x4fa36a, stack: 5 },
  tool: { cat: 'tool', shape: 'tool', tint: 0x9aa3a6, stack: 3 },
};

/**
 * Size in the one catalogue. Tyres are wheels on their rims: large, like the lead's tyre.road (two
 * people, or one slowly). Parts that carry a condition do not stack.
 */
function register(): void {
  const defs = [];
  for (const it of PARTS_CATALOG) {
    if (hasItem(it.id)) continue;
    const look = LOOK[it.kind === 'part' ? it.slot! : it.kind];
    defs.push({
      id: it.id,
      zh: it.zh,
      en: it.en,
      cat: look.cat,
      size: it.kind === 'tyre' ? ('large' as const) : it.size,
      stack: it.kind === 'part' ? 1 : (look.stack ?? 1),
      rarity: (it.tier === undefined ? 0 : Math.min(2, Math.max(0, it.tier - 1))) as 0 | 1 | 2,
      shape: look.shape,
      tint: look.tint,
    });
  }
  registerItems(defs);
}
register();
