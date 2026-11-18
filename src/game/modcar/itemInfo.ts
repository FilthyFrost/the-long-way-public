/**
 * The item cards' contents (docs/MODCAR.md §5.5): what a part, a tool, a vehicle or a workshop machine is,
 * what it is for and how it stands — its grade, one line about it, its numbers (an engine's torque curve, a
 * tyre's grip on each ground), what is in it (fuel by kind, oil, water, charge) as bars, its condition and
 * weight, the vehicles it fits. Plain data; cards.ts draws it. The held thing's card and the card of what
 * the mark is on are both made here.
 *
 * A thing's card (itemCard) also says how many there are in a stack, how fresh a thing that goes off is,
 * its quality, and what a thing that holds things has in it; a system adds lines of its own to the cards of
 * its kinds through registerItemCardLines, without this file being edited. itemCardKept is the same card
 * for the words on screen that ask for it every frame: made again only when something on it changed.
 */
import { DEVICE_BLURB, FRAME_BLURB, PART_BLURB, SCRAPER_BLURB, SPRAY_BLURB, TOOL_BLURB } from '../../core/modcar/blurbs';
import { partSalvage, toolSalvage } from '../../core/modcar/crafting';
import { countOf, freshNow, freshStage, insideMass, itemCat, itemDef, itemMass, itemName, MATERIALS, MATERIAL_IDS, salvageOf, type FreshStage, type ItemCat, type ItemInstance, type WearSlot } from '../../core/modcar/items';
import { BRAKE_HEAT, heatKindOf } from '../../core/modcar/brakeHeat';
import { mountsFor } from '../../core/modcar/build';
import { boostedCurve } from '../../core/modcar/derive';
import { CAT_LABEL, FRAMES } from '../../core/modcar/frames';
import { PALETTE, paintHex } from '../../core/modcar/palette';
import { SPRAY_TIERS, sprayLeft, sprayTier } from '../../core/modcar/paint';
import { kmLeft, TYRE_STAGES, tyreStage } from '../../core/modcar/tyres';
import { partDef, PARTS } from '../../core/modcar/parts';
import { crankProblems, driveProblems, runProblems, warnings } from '../../core/modcar/rules';
import { quickPerf, type StatLine } from '../../core/modcar/stats';
import { SCRAPERS, TOOL_INFO, toolName, type Tool } from '../../core/modcar/tools';
import type { Category, FuelType, PartDef, PartInstance, Text } from '../../core/modcar/types';
import type { GarageDevice } from './garageStub';
import { itemNow } from './itemTime';
import { seatCushion } from './seatShake';
import type { ModVehicle } from './vehicle';

/** what a bar is filled with (its colour) */
export type Tone = 'petrol' | 'diesel' | 'mix2t' | 'water' | 'oil' | 'charge' | 'good' | 'mid' | 'bad';

export interface CardBar {
  label: string;
  /** filled share 0…1 is value / max */
  value: number;
  max: number;
  /** the numbers beside it ("7.9 / 20 L") */
  text: string;
  tone: Tone;
  /** a bar of several liquids: each kind's share, with its own colour and line under the bar */
  parts?: { tone: Tone; value: number; text: string }[];
  /** its own colour (CSS) over the tone's (a spray can's paint) */
  colour?: string;
}

export interface CardRow {
  /** the number, first and bold ("44 kW") */
  value: string;
  label: string;
  tone?: 'good' | 'bad';
  /** what it was before (a part held up to a mount: before → after) */
  from?: string;
  /** drawn as so many stars out of five in place of the number (a thing's quality); `value` says the same in words */
  stars?: number;
}

/** a curve: x and y of its points, the ticks on each axis */
export interface CardCurve {
  label: string;
  points: [number, number][];
  xTicks: number[];
  yTicks: number[];
  /** a mark on it ("峰值") */
  peak?: [number, number];
}

/** bars side by side: a tyre's grip on each ground */
export interface CardColumns {
  label: string;
  items: { label: string; value: number }[];
  /** the value that fills a column */
  max: number;
}

export type CardIcon = 'engine' | 'wheel' | 'body' | 'cab' | 'electric' | 'tool' | 'car' | 'device' | 'food' | 'drink' | 'med' | 'wear' | 'pack' | 'box';

export interface ItemCard {
  /** what it is (a new key = drawn again; the same key = only its bars move) */
  key: string;
  icon: CardIcon;
  /** the line over the name ("动力 · 发动机") */
  cat: string;
  name: string;
  /** 0 = none shown */
  stars: number;
  badges: { text: string; tone: 'stock' | 'apoc' | 'meme' | 'note' | 'warn' }[];
  blurb: string;
  curve?: CardCurve;
  columns?: CardColumns;
  rows: CardRow[];
  bars: CardBar[];
  notes: { text: string; tone: 'warn' | 'ok' | 'info' }[];
  foot: { cond?: number; mass?: number; fits?: string };
  /**
   * Made once and never changed after (itemCardKept): the same object shown again is the same card, and the
   * view does not look into it again. Whoever is handed such a card must not write into it.
   */
  kept?: true;
}

const GROUP: Partial<Record<Category, [string, CardIcon]>> = {
  engine: ['动力', 'engine'],
  turbo: ['动力', 'engine'],
  gearbox: ['动力', 'engine'],
  radiator: ['动力', 'engine'],
  fuelTank: ['动力', 'engine'],
  exhaust: ['动力', 'engine'],
  rim: ['车轮', 'wheel'],
  tire: ['车轮', 'wheel'],
  suspension: ['底盘', 'wheel'],
  brakes: ['底盘', 'wheel'],
  diff: ['底盘', 'wheel'],
  seat: ['驾驶舱', 'cab'],
  steering: ['驾驶舱', 'cab'],
  gearLever: ['驾驶舱', 'cab'],
  handbrake: ['驾驶舱', 'cab'],
  ignition: ['驾驶舱', 'cab'],
  battery: ['电气', 'electric'],
  headlight: ['电气', 'electric'],
  taillight: ['电气', 'electric'],
  horn: ['电气', 'electric'],
  radio: ['电气', 'electric'],
};

export const FUEL_ZH: Record<FuelType, string> = { petrol: '汽油', diesel: '柴油', mix2t: '混合油' };
const SURFACES_ZH = ['柏油', '砂石', '土路', '草地', '沙地', '雪地', '冰面'];

const L = (v: number): string => `${Math.max(0, v).toFixed(v >= 100 ? 0 : 1)}`;
/** an sRGB hex colour as CSS */
export const hexCss = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const signPct = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`;

/** the dry weight of a part with what is in it and on it (kg) */
export function instanceMass(inst: PartInstance): number {
  let kg = partDef(inst.part).mass;
  const f = inst.fluids;
  for (const l of Object.values(f.fuel ?? {})) kg += (l ?? 0) * 0.75;
  kg += (f.oilL ?? 0) * 0.9 + (f.coolantL ?? 0);
  for (const s of Object.values(inst.sub)) kg += instanceMass(s);
  return kg;
}

/** the weight of a tool with what is in it (kg) */
export function toolMass(t: Tool): number {
  if (t.kind === 'jerrycan') return 4 + (t.litres ?? 0) * 0.75;
  if (t.kind === 'bottle') return 0.3 + (t.litres ?? 0);
  if (t.kind === 'oilcan') return 0.4 + (t.litres ?? 0) * 0.9;
  return t.kind === 'spray' ? SPRAY_TIERS[sprayTier(t)].mass : 0.1;
}

function badgesOf(def: PartDef): ItemCard['badges'] {
  const out: ItemCard['badges'] = [];
  const stock = (def.tags ?? []).filter((t) => t.startsWith('stock:')).map((t) => FRAMES.find((f) => f.id === t.slice(6))?.name.zh ?? '');
  if (stock.length) out.push({ text: `原装 · ${stock.join('、')}`, tone: 'stock' });
  if (def.tags?.includes('apoc')) out.push({ text: '末日', tone: 'apoc' });
  if (def.tags?.includes('meme')) out.push({ text: '整活', tone: 'meme' });
  return out;
}

/** the vehicles a part goes on ("方糖、骡子"), or where it goes when it is not on a mount of its own */
function fitsOf(def: PartDef): string {
  if (def.cat === 'tire') return '装在带胎的车轮上';
  if (def.cat === 'turbo') {
    const engines = PARTS.filter((p) => p.engine?.turbo).map((p) => p.name.zh);
    return engines.length ? `装在 ${engines.join('、')} 上` : '';
  }
  const names = FRAMES.filter((f) => mountsFor(f, def).length).map((f) => f.name.zh);
  return names.length ? names.join('、') : '';
}

/** the fuel in a tank (or a jerrycan's) as a bar of its kinds */
export function fuelBar(label: string, fuel: Partial<Record<FuelType, number>>, max: number): CardBar {
  const kinds = (['petrol', 'diesel', 'mix2t'] as FuelType[]).filter((k) => (fuel[k] ?? 0) > 0.005);
  const total = kinds.reduce((s, k) => s + (fuel[k] ?? 0), 0);
  return {
    label,
    value: total,
    max,
    text: `${L(total)} / ${L(max)} L`,
    tone: kinds.length === 1 ? kinds[0] : 'petrol',
    parts: kinds.map((k) => ({ tone: k, value: fuel[k] ?? 0, text: `${L(fuel[k] ?? 0)} L ${FUEL_ZH[k]}` })),
  };
}

function condTone(c: number): Tone {
  return c > 0.6 ? 'good' : c > 0.3 ? 'mid' : 'bad';
}

/** an engine's torque curve, sampled for the card (with the turbo on it, when one is) */
function torqueCurve(def: PartDef, turbo: PartDef | null): CardCurve {
  const e = def.engine!;
  const curve = turbo ? boostedCurve(def, null, turbo) : e.curve;
  // (the last point is past the redline at 0 N·m: the card stops at the redline)
  const pts = curve.filter(([r]) => r <= e.redline + 1);
  const at = (rpm: number): number => {
    if (rpm <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (rpm <= pts[i][0]) return pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * (rpm - pts[i - 1][0])) / (pts[i][0] - pts[i - 1][0]);
    return pts.at(-1)![1];
  };
  const x0 = Math.max(0, Math.min(e.idle, pts[0][0]));
  const x1 = e.redline;
  const points: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const r = x0 + ((x1 - x0) * i) / 32;
    points.push([r, at(r)]);
  }
  let peak: [number, number] = points[0];
  for (const p of points) if (p[1] > peak[1]) peak = p;
  const top = niceCeil(peak[1] * 1.1);
  return { label: '扭矩曲线（牛·米 / 转速）', points, xTicks: ticks(x0, x1, 4).map(Math.round), yTicks: [0, top / 2, top].map((v) => Math.round(v)), peak };
}

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1e-6, v)));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function ticks(a: number, b: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** peak power of a torque curve (kW) and where */
function peakPower(curve: [number, number][]): { kw: number; rpm: number } {
  let best = { kw: 0, rpm: 0 };
  for (let i = 0; i < curve.length - 1; i++) {
    for (let k = 0; k <= 8; k++) {
      const r = curve[i][0] + ((curve[i + 1][0] - curve[i][0]) * k) / 8;
      const nm = curve[i][1] + ((curve[i + 1][1] - curve[i][1]) * k) / 8;
      const kw = (r * nm * Math.PI) / 30 / 1000;
      if (kw > best.kw) best = { kw, rpm: r };
    }
  }
  return best;
}

// ------------------------------------------------------------------ parts

export interface PartContext {
  /** where it is fitted ("左前车轮"), when it is on a vehicle */
  mount?: string;
}

export function partCard(inst: PartInstance, ctx: PartContext = {}): ItemCard {
  const def = partDef(inst.part);
  const [group, icon] = GROUP[def.cat] ?? ['车身', 'body'];
  const blurb = PART_BLURB[def.id];
  const card: ItemCard = {
    key: `part:${inst.uid}:${inst.part}:${inst.sub.tire?.part ?? ''}:${inst.sub.turbo?.part ?? ''}`,
    icon,
    cat: `${group} · ${CAT_LABEL[def.cat].zh}`,
    name: def.name.zh,
    stars: blurb?.stars ?? 0,
    badges: badgesOf(def),
    blurb: blurb?.zh ?? '',
    rows: [],
    bars: [],
    notes: [],
    foot: { cond: inst.cond, mass: instanceMass(inst), fits: fitsOf(def) },
  };
  if (ctx.mount) {
    card.badges.unshift({ text: `装在：${ctx.mount}`, tone: 'note' });
    // (on a vehicle already: where else it goes is beside the point)
    card.foot.fits = undefined;
  }
  const row = (value: string, label: string, tone?: CardRow['tone']): void => {
    card.rows.push({ value, label, tone });
  };
  if (def.engine) {
    const e = def.engine;
    const turbo = inst.sub.turbo ? partDef(inst.sub.turbo.part) : null;
    card.curve = torqueCurve(def, turbo);
    const p = peakPower(turbo ? boostedCurve(def, null, turbo) : e.curve);
    row(`${p.kw.toFixed(0)} kW`, '最大功率');
    row(`${Math.round(card.curve.peak![1])} N·m`, '峰值扭矩');
    row(FUEL_ZH[e.fuel], e.fuel === 'mix2t' ? '燃料 · 汽油里要掺机油' : '燃料');
    row(e.cooling === 'water' ? '水冷' : '风冷', e.cooling === 'water' ? '要装散热器、加水' : '不用水箱');
    if (e.turbo) card.badges.push({ text: turbo ? `已装涡轮：${turbo.name.zh}` : '能装涡轮', tone: 'note' });
    if (e.oilL > 0) card.bars.push({ label: '机油', value: inst.fluids.oilL ?? 0, max: e.oilL, text: `${L(inst.fluids.oilL ?? 0)} / ${L(e.oilL)} L`, tone: 'oil' });
    else card.notes.push({ text: '二冲程：不用加机油，机油掺在汽油里', tone: 'info' });
  }
  if (def.gearbox) {
    const g = def.gearbox;
    row(`${g.ratios.length} 个`, '前进挡');
    row(g.ratios.map((r) => r.toFixed(2)).join(' · '), '各挡速比');
    row(g.reverse > 0 ? '有' : '没有', '倒挡');
    row(`${g.shiftTime.toFixed(2)} 秒`, '换挡用时');
    row(pct(g.efficiency), '传动效率');
  }
  if (def.radiator) {
    const r = def.radiator;
    row(`${r.coolKw} kW`, '散热能力（车速快时）');
    card.bars.push({ label: '冷却液', value: inst.fluids.coolantL ?? 0, max: r.coolantL, text: `${L(inst.fluids.coolantL ?? 0)} / ${L(r.coolantL)} L`, tone: 'water' });
  }
  if (def.battery) {
    const c = inst.fluids.charge ?? 0;
    row(`${def.battery.kWh} kWh`, '容量');
    card.bars.push({ label: '电量', value: c, max: 1, text: pct(c), tone: 'charge' });
  }
  if (def.fuelTank) card.bars.push(fuelBar('油量', inst.fluids.fuel ?? {}, def.fuelTank.litres));
  if (def.exhaust) {
    row(signPct(def.exhaust.torque - 1), '扭矩');
    row(`×${def.exhaust.loud}`, '音量');
  }
  if (def.turbo) {
    row(signPct(def.turbo.boost - 1), '高转扭矩');
    row(`${def.turbo.spoolRpm} 转`, '起压转速');
    row(`${def.turbo.lag} 秒`, '迟滞');
  }
  if (def.rim) {
    const r = def.rim;
    row(`${Math.round((r.radius * 2) / 0.0254)} 寸`, '轮圈尺寸');
    row(`${Math.round(r.width * 100)} 厘米`, '宽度');
    const t = inst.sub.tire;
    if (!r.tire) card.notes.push({ text: '这个轮子不用装胎', tone: 'info' });
    else if (t) {
      const td = partDef(t.part);
      row(td.name.zh, '轮胎');
      card.columns = { label: '各种路面的抓地', items: td.tire!.grip.map((g, i) => ({ label: SURFACES_ZH[i], value: g })), max: 1.6 };
      card.bars.push({ label: '胎纹', value: t.tread ?? 1, max: 1, text: `${pct(t.tread ?? 1)} · ${TYRE_STAGES[tyreStage(t.tread ?? 1)].zh}`, tone: condTone(t.tread ?? 1) });
      tyreLines(card, row, t, td.tire!);
    } else card.notes.push({ text: '只有钢圈，没装轮胎：又滑又吵', tone: 'warn' });
  }
  if (def.tire) {
    const t = def.tire;
    card.columns = { label: '各种路面的抓地', items: t.grip.map((g, i) => ({ label: SURFACES_ZH[i], value: g })), max: 1.6 };
    card.bars.push({ label: '胎纹', value: inst.tread ?? 1, max: 1, text: `${pct(inst.tread ?? 1)} · ${TYRE_STAGES[tyreStage(inst.tread ?? 1)].zh}`, tone: condTone(inst.tread ?? 1) });
    tyreLines(card, row, inst, t);
  }
  if (def.steering) {
    const s = def.steering;
    row(s.bar ? '车把' : `${s.ratio} : 1`, s.bar ? '转向' : '转向比（越小越灵）');
    row(`${s.playDeg}°`, '虚位（越小越跟手）');
  }
  if (def.seat) {
    row(pct(def.seat.comfort), '舒适');
    // (what of the road and the engine it passes on to the driver: seatShake.ts)
    const k = seatCushion(def.seat.comfort);
    row(k < 0.97 ? `少 ${Math.round((1 - k) * 100)}%` : k > 1.03 ? `多 ${Math.round((k - 1) * 100)}%` : '跟原厂一样', '开车颠簸');
    if (def.seat.swivel) row('能', '转圈');
  }
  if (def.radio) {
    row(def.radio.tape ? '能' : '不能', '放磁带');
    row(`${def.radio.watts} W`, '功率');
  }
  if (def.handbrake) row(`×${def.handbrake.strength}`, '刹住后轮的力气');
  if (def.suspension) {
    const s = def.suspension;
    row(signPct(s.spring - 1), '弹簧硬度');
    row(signPct(s.damping - 1), '减震力度');
    row(signPct(s.travel - 1), '行程');
    row(signPct(s.antiRoll - 1), '防倾杆');
    if (s.lift) row(`${s.lift > 0 ? '+' : '−'}${Math.round(Math.abs(s.lift) * 100)} 厘米`, '车身高度');
    card.notes.push({ text: '一套是一根轴的：左右两边一起换', tone: 'info' });
  }
  if (def.brakes) {
    row({ drum: '鼓刹', disc: '实心盘', vented: '通风盘', drilled: '打孔盘' }[def.brakes.kind], '形式');
    row(signPct(def.brakes.power - 1), '制动力');
    // (where it starts to fade: brakeHeat.ts, over a 20 °C day)
    row(`${Math.round((20 + BRAKE_HEAT[heatKindOf(def.id, def.brakes.kind)].fadeAt) / 10) * 10} °C`, '过热变软');
  }
  if (def.diff) {
    row({ open: '开放', lsd: '限滑', locked: '锁止' }[def.diff.kind], '形式');
    if (def.diff.kind === 'lsd') row(`${def.diff.bias} : 1`, '锁止比');
    card.notes.push({ text: def.diff.kind === 'open' ? '一边打滑，另一边也没劲' : def.diff.kind === 'lsd' ? '打滑的一边少分劲，抓地的一边多分' : '两边一起转：烂路最强，铺装路转弯发涩', tone: 'info' });
  }
  if (def.gearLever) row(def.gearLever.shift < 1 ? `快 ${Math.round((1 - def.gearLever.shift) * 100)}%` : '一般', '换挡');
  if (def.ignition) row(def.ignition.kind === 'key' ? '拧钥匙' : '按按钮', '点火方式');
  if (def.horn) row({ beep: '嘀嘀', trumpet: '一段曲子', air: '汽笛' }[def.horn.sound] ?? def.horn.sound, '声音');
  if (def.panel) {
    const p = def.panel;
    row(pct(p.armor), '防护');
    if (p.drag) row(`+${p.drag.toFixed(2)}`, '风阻');
    if (def.cat === 'door') row(p.window ? '有' : '没有', '车窗');
    if (p.cooling) row(signPct(p.cooling), '发动机散热', 'good');
  }
  if (def.bumper) {
    row(pct(def.bumper.ram), '撞击力');
    if (def.bumper.drag) row(`+${def.bumper.drag.toFixed(2)}`, '风阻');
    if (def.bumper.plow) row('能', '推雪');
  }
  if (def.lamp) {
    row(`×${def.lamp.light}`, '亮度');
    row(`×${def.lamp.reach}`, '照多远');
    row(`${def.lamp.watts} W`, '耗电');
  }
  if (def.mirror) row(`×${def.mirror.size}`, '镜面大小');
  if (def.roof) {
    const r = def.roof;
    row(`+${r.drag.toFixed(2)}`, '风阻');
    if (r.lightW) row(`${r.lightW} W`, '车顶灯');
    if (r.solarW) row(`${r.solarW} W`, '太阳能（停着也充电）', 'good');
    if (r.ram) row(pct(r.ram), '撞击力');
  }
  if (def.armor) {
    row(pct(def.armor.armor), '防护');
    row(`+${def.armor.drag.toFixed(2)}`, '风阻');
  }
  const s = salvageText(partSalvage(inst));
  if (s) row(s, '回收能得');
  if (inst.rust > 0.25) card.notes.push({ text: `锈了 ${pct(inst.rust)}：用钢丝刷刷一刷`, tone: 'info' });
  else if (inst.dirt > 0.4) card.notes.push({ text: '有点脏：用海绵擦一擦', tone: 'info' });
  return card;
}

/** a tyre's stage, how far it has left, what a new one goes, what to watch for (tyres.ts) */
function tyreLines(card: ItemCard, row: (value: string, label: string) => void, t: PartInstance, def: NonNullable<PartDef['tire']>): void {
  const tread = t.tread ?? 1;
  const stage = tyreStage(tread);
  const left = kmLeft(def, tread);
  row(TYRE_STAGES[stage].zh, '现在');
  if (stage < 3) row(`约 ${Math.max(1, Math.round(left.lastStage))} km`, '离“听天由命”还有');
  else row(`约 ${Math.round(left.bald)} km`, '离磨平还有');
  row(`${def.life} km`, '新胎能跑（柏油路）');
  if (t.flat) card.notes.push({ text: '爆了：装上去那个角会塌下去，车往这边偏', tone: 'warn' });
  else if (stage === 3) card.notes.push({ text: '听天由命：随时可能爆胎，碎石路、土路上更容易', tone: 'warn' });
  else if (stage === 2) card.notes.push({ text: '很旧了：下雨天容易打滑', tone: 'info' });
}

// ------------------------------------------------------------------ tools

export function toolCard(t: Tool): ItemCard {
  const info = TOOL_INFO[t.kind];
  const blurb = t.kind === 'scraper' ? SCRAPER_BLURB[t.tier ?? 1] : t.kind === 'spray' ? SPRAY_BLURB[sprayTier(t)] : TOOL_BLURB[t.kind];
  const card: ItemCard = {
    key: `tool:${t.uid}:${t.kind}:${t.fuel ?? ''}:${t.colour ?? ''}:${t.tier ?? ''}`,
    icon: 'tool',
    cat: '工具',
    name: t.kind === 'jerrycan' ? `油桶（${FUEL_ZH[t.fuel ?? 'petrol']}）` : t.kind === 'scraper' ? SCRAPERS[t.tier ?? 1].name.zh : t.kind === 'spray' ? toolName(t) : info.name.zh,
    stars: blurb.stars,
    badges: [],
    blurb: blurb.zh,
    rows: [],
    bars: [],
    notes: [],
    foot: { mass: toolMass(t) },
  };
  const l = t.litres ?? 0;
  if (t.kind === 'jerrycan') {
    card.bars.push(fuelBar('液体含量', { [t.fuel ?? 'petrol']: l }, info.capacity));
    card.rows.push({ value: `${info.rate} L/秒`, label: '倒得多快' });
    card.notes.push({ text: '对着打开的加油口按住 E 加油；按住右键把油抽回桶里', tone: 'info' });
  } else if (t.kind === 'bottle') {
    card.bars.push({ label: '液体含量', value: l, max: info.capacity, text: `${L(l)} / ${L(info.capacity)} L`, tone: 'water', parts: [{ tone: 'water', value: l, text: `${L(l)} L 水` }] });
    card.rows.push({ value: `${info.rate} L/秒`, label: '倒得多快' });
    card.notes.push({ text: '打开引擎盖，对着散热器的水箱盖按住 E 加水；在水龙头那里灌满', tone: 'info' });
  } else if (t.kind === 'oilcan') {
    card.bars.push({ label: '液体含量', value: l, max: info.capacity, text: `${L(l)} / ${L(info.capacity)} L`, tone: 'oil', parts: [{ tone: 'oil', value: l, text: `${L(l)} L 机油` }] });
    card.rows.push({ value: `${info.rate} L/秒`, label: '倒得多快' });
    card.notes.push({ text: '打开引擎盖，对着发动机上的机油盖按住 E 加机油', tone: 'info' });
  } else if (t.kind === 'spray') {
    // (Arctic Drive's: the paint left, a part's worth at a time; the can's colour)
    const size = SPRAY_TIERS[sprayTier(t)];
    const left = sprayLeft(t);
    card.bars.push({ label: '剩余漆量', value: left, max: size.capacity, text: `${Math.ceil(left - 1e-6)} / ${size.capacity}`, tone: 'good', colour: hexCss(paintHex(t.colour ?? 0)) });
    card.rows.push({ value: PALETTE[t.colour ?? 0]?.name.zh ?? '', label: '颜色' });
    card.rows.push({ value: `${(1 / size.speed).toFixed(1)} 秒`, label: '喷好一个部件' });
    card.rows.push({ value: left > 0 ? `约 ${Math.max(1, Math.round(left * size.speed))} 个` : '0 个', label: '还能喷' });
    if (left <= 0) card.notes.push({ text: '空了：丢进回收台', tone: 'warn' });
    else card.notes.push({ text: '对着车身、车门、引擎盖、尾门、保险杠、后视镜按住左键；已经是这个颜色的不耗漆', tone: 'info' });
  } else if (t.kind === 'scraper') {
    card.rows.push({ value: `${Math.round(SCRAPERS[t.tier ?? 1].width * 100)} cm`, label: '刀口宽' });
    card.notes.push({ text: '按住左键刮：车窗、车身上糊死的泥壳；鼠标带着走，来回两三遍', tone: 'info' });
  }
  const s = salvageText(toolSalvage(t));
  if (s) card.rows.push({ value: s, label: '回收能得' });
  return card;
}

// ------------------------------------------------------------------ items (food, drinks, clothes, junk …)

const ITEM_ICON: Record<ItemCat, CardIcon> = { food: 'food', drink: 'drink', med: 'med', wear: 'wear', pack: 'pack', lamp: 'electric', gear: 'tool', junk: 'box', crate: 'box' };
const SLOT_ZH: Record<WearSlot, string> = { hat: '戴在头上', jacket: '穿在身上', pants: '穿在腿上', shoes: '穿在脚上', gloves: '戴在手上' };
const DRINK_ZH = { water: '水', alcohol: '酒', energy: '能量饮料' } as const;

/** what the recycler gives for it, in words ("20 废料 · 8 有机物"), or '' for nothing */
export function salvageText(s: Partial<Record<string, number>>): string {
  return MATERIAL_IDS.filter((m) => (s[m] ?? 0) > 0)
    .map((m) => `${s[m]} ${MATERIALS[m].name.zh}`)
    .join(' · ');
}

/**
 * Counts every change in what things are called or what their cards say that cannot be seen in the things
 * themselves: the names and cards kept here are made again after it.
 */
let wordsVersion = 0;

/**
 * What things are called, or what their cards say, has changed for a reason that is not in the things (the
 * player has learnt what a kind is, a system's lines now read something else at once): the names and the
 * cards kept between frames are made again the next time they are asked for.
 */
export function itemWordsChanged(): void {
  wordsVersion++;
}

/** a name built for a stack or a drink, kept with what it was built for */
interface KeptLabel {
  item: string;
  n: number;
  litres: number;
  v: number;
  /** as itemName gives it; and without the count of a stack */
  text: string;
  plain: string;
}

const LABELS = new WeakMap<ItemInstance, KeptLabel>();

/** the name kept for a stack or a drink, made again when its kind, its count or its level changed */
function keptLabel(inst: ItemInstance, n: number): KeptLabel {
  const litres = inst.litres ?? 0;
  let m = LABELS.get(inst);
  if (!m) {
    m = { item: '', n: 0, litres: 0, v: -1, text: '', plain: '' };
    LABELS.set(inst, m);
  } else if (m.item === inst.item && m.n === n && m.litres === litres && m.v === wordsVersion) return m;
  m.item = inst.item;
  m.n = n;
  m.litres = litres;
  m.v = wordsVersion;
  m.text = itemName(inst);
  // (a stack's name ends in its count, " ×3": the name without it is what its slot is called)
  const cut = n > 1 ? m.text.lastIndexOf(' ×') : -1;
  m.plain = cut > 0 ? m.text.slice(0, cut) : m.text;
  return m;
}

/**
 * A thing's name as itemName gives it ("试验莓 ×3", "矿泉水（0.50 L）"), for the words on screen that ask for
 * it every frame: the string is built when the kind, the count or the level of the thing changes, and is the
 * same string until then. A plain thing's name is its kind's, and nothing is kept for it.
 */
export function itemLabel(inst: ItemInstance): string {
  const n = inst.n ?? 1;
  if (n <= 1 && !itemDef(inst.item).drink) return itemName(inst);
  return keptLabel(inst, n).text;
}

/** the same without a stack's count ("试验莓"): what a slot of the hotbar is called, the count being drawn in its corner */
export function itemLabelPlain(inst: ItemInstance): string {
  const n = inst.n ?? 1;
  if (n <= 1 && !itemDef(inst.item).drink) return itemName(inst);
  return keptLabel(inst, n).plain;
}

/** how fresh a thing that goes off is, in words (by freshStage: 0 fresh, 1 still good, 2 going off, 3 turned) */
export const FRESH_WORD: readonly Text[] = [
  { zh: '新鲜', en: 'Fresh' },
  { zh: '还行', en: 'Still good' },
  { zh: '快坏了', en: 'Going off' },
  { zh: '坏了', en: 'Turned' },
];
const FRESH_TONE: readonly Tone[] = ['good', 'mid', 'bad', 'bad'];

/** how long a thing still keeps where it is, in words ("约 14 小时"); the hours are the game's */
function keepsFor(hours: number): string {
  if (hours >= 48) return `约 ${Math.round(hours / 24)} 天`;
  if (hours >= 1) return `约 ${Math.round(hours)} 小时`;
  return '不到 1 小时';
}

/** a weight inside a thing ("0.15", "1.2", "12"): small things to the gram's hundred */
const kgOf = (kg: number): string => (kg >= 10 ? kg.toFixed(0) : kg >= 1 ? kg.toFixed(1) : kg.toFixed(2));

/** the most things in a basket a card names one by one (the rest are counted) */
const INSIDE_ROWS = 6;

// ---- lines other systems add to the cards of their own kinds

/**
 * What a system adds to the card of one of its kinds: it is handed the thing, the card as made so far (it
 * pushes rows, bars, notes or badges of its own, or changes what is there) and the world's time for freshNow.
 */
export type ItemCardLines = (inst: ItemInstance, card: ItemCard, nowS: number) => void;

const LINES_BY_ITEM = new Map<string, ItemCardLines[]>();
const LINES_BY_CAT = new Map<string, ItemCardLines[]>();

/**
 * A system's own lines on the cards of its kinds, without this file being edited: for one kind
 * ({ item: 'forage_basket' }) or for every kind of a category ({ cat: 'forage' }). Called once, as the
 * system's module is loaded. `add` runs each time such a card is made, after the lines made here, a
 * category's before a kind's, each in the order registered; a card on screen is made again when its thing's
 * kind, count, level, freshness or contents change and otherwise a few times a second (itemCardKept), so
 * `add` may read the thing's own `state` freely and need not be told when it changes (itemWordsChanged makes
 * every card again at once) — but it is never run per frame, and must not keep the card.
 */
export function registerItemCardLines(to: { readonly item: string } | { readonly cat: string }, add: ItemCardLines): void {
  const map = 'item' in to ? LINES_BY_ITEM : LINES_BY_CAT;
  const key = 'item' in to ? to.item : to.cat;
  const list = map.get(key);
  if (list) list.push(add);
  else map.set(key, [add]);
}

/** where a system's lines that threw are reported (null: written to the console, once for each message) */
let linesFault: ((where: string, error: unknown) => void) | null = null;
const faultsSaid = new Set<string>();

/** hand the faults of systems' card lines to the game's own report (the kernel's); null: back to the console */
export function setItemCardFault(report: ((where: string, error: unknown) => void) | null): void {
  linesFault = report;
}

/** a system's lines on one card: lines that throw are reported and passed over, the card is shown without them */
function addLines(list: ItemCardLines[] | undefined, of: string, inst: ItemInstance, card: ItemCard, nowS: number): void {
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    try {
      list[i](inst, card, nowS);
    } catch (e) {
      const where = `item card lines (${of})`;
      if (linesFault) linesFault(where, e);
      else if (!faultsSaid.has(`${where}: ${String(e)}`)) {
        faultsSaid.add(`${where}: ${String(e)}`);
        console.error(`${where}: ${String(e)}`);
      }
    }
  }
}

/**
 * The card of a thing: what its kind is and does, and how this one stands — how many in the stack, how fresh,
 * its quality, what is in it. nowS: the world clock's seconds (freshness is read against it).
 */
export function itemCard(inst: ItemInstance, nowS: number = itemNow()): ItemCard {
  const d = itemDef(inst.item);
  const n = countOf(inst);
  const stacks = (d.stack ?? 1) > 1;
  const card: ItemCard = {
    key: `item:${inst.uid}:${inst.item}`,
    icon: (ITEM_ICON as Partial<Record<string, CardIcon>>)[d.cat] ?? 'box',
    cat: itemCat(d.cat).name.zh,
    // (a stack's name says how many, as everywhere; a drink's is its kind's: what is in it is the card's first bar)
    name: d.drink ? d.name.zh : itemName(inst),
    stars: d.stars,
    badges: [],
    blurb: d.blurb,
    rows: [],
    bars: [],
    notes: [],
    foot: { mass: itemMass(inst) },
  };
  // a kind that stacks: how many there are of how many a stack holds; what one of them does is said as one's
  const each = stacks ? '（每个）' : '';
  if (stacks) card.rows.push({ value: `${n} 个`, label: `一叠（最多 ${d.stack} 个）` });
  if (inst.q !== undefined) card.rows.push({ value: `${inst.q} 星`, label: '品质', stars: inst.q });
  if (d.eat && (d.eat.food > 0 || d.eat.hp > 0)) {
    if (d.eat.food > 0) card.rows.push({ value: `+${d.eat.food}`, label: `饱腹${each}`, tone: 'good' });
    if (d.eat.hp > 0) card.rows.push({ value: `+${d.eat.hp}`, label: `生命${each}`, tone: 'good' });
  }
  if (d.eat?.effect === 'warm1' || d.eat?.effect === 'warm2') card.notes.push({ text: `吃完身上暖和一阵（${d.eat.effect === 'warm2' ? '5' : '3'} 分钟）`, tone: 'ok' });
  if (d.eat?.effect === 'sick1' || d.eat?.effect === 'sick2') card.notes.push({ text: '吃了会闹肚子：一阵子掉水分', tone: 'warn' });
  if (d.drink) {
    const l = inst.litres ?? 0;
    const tone: Tone = d.drink.liquid === 'water' ? 'water' : d.drink.liquid === 'alcohol' ? 'mix2t' : 'charge';
    card.bars.push({ label: '还剩', value: l, max: d.drink.litres, text: `${l.toFixed(2)} / ${d.drink.litres} L`, tone, parts: [{ tone, value: l, text: `${l.toFixed(2)} L ${DRINK_ZH[d.drink.liquid]}` }] });
    if (d.drink.liquid === 'water') card.rows.push({ value: '+10', label: '解渴（每 0.1 L）', tone: 'good' });
    else if (d.drink.liquid === 'alcohol') card.notes.push({ text: '喝了会醉：看东西晃，手脚慢半拍，但不怕冷', tone: 'warn' });
    else card.notes.push({ text: '喝完半分钟里跑得快一半，但不解渴', tone: 'ok' });
  }
  if (d.heal) {
    if (d.heal.hp > 0) card.rows.push({ value: `+${d.heal.hp}`, label: '生命（马上）', tone: 'good' });
    if (d.heal.warm) card.rows.push({ value: `+${d.heal.warm} °C`, label: '体温', tone: 'good' });
    if (d.heal.side) card.notes.push({ text: `${Math.round(d.heal.side * 100)}% 会有副作用（醉或中毒）`, tone: 'warn' });
  }
  if (d.revive) card.notes.push({ text: `带在身上：倒下时自动用掉，站起来时生命 ${d.revive.hp}`, tone: 'ok' });
  if (d.wear) card.rows.push({ value: `+${d.wear.warmth}`, label: `保暖 · ${SLOT_ZH[d.wear.slot]}`, tone: 'good' });
  if (d.pack) card.rows.push({ value: `+${d.pack.slots} 格`, label: '快捷栏', tone: 'good' });
  if (d.lamp) card.rows.push({ value: `${d.lamp.range} m`, label: '照多远' });
  if (d.gear?.kind === 'hammer') card.bars.push({ label: '还能砸', value: inst.uses ?? 0, max: d.gear.uses ?? 1, text: `${inst.uses ?? 0} / ${d.gear.uses} 下`, tone: 'mid' });
  if (d.gear?.kind === 'repair') card.bars.push({ label: '修理点数', value: inst.uses ?? 0, max: d.gear.points ?? 1, text: `${inst.uses ?? 0} / ${d.gear.points}`, tone: 'good' });
  // a thing that goes off: how fresh, in words, and how long it still keeps where it is
  if (d.perish) {
    const f = freshNow(inst, nowS);
    const st = freshStage(f);
    const rate = inst.fk ?? 1;
    const keeps = st === 3 ? '' : rate > 0 ? ` · 还能放${keepsFor((f * d.perish.hours) / rate)}` : ' · 放在这里不会坏';
    card.bars.push({ label: '新鲜程度', value: f, max: 1, text: `${FRESH_WORD[st].zh}${keeps}`, tone: FRESH_TONE[st] });
  }
  // a thing that holds things: how full, and what is in it
  if (d.holds) {
    const h = d.holds;
    const ins = inst.inside;
    const used = ins ? ins.length : 0;
    const kg = insideMass(inst);
    const weight = h.maxKg !== undefined ? `${kgOf(kg)} / ${h.maxKg} kg` : `${kgOf(kg)} kg`;
    card.bars.push({ label: '装着', value: Math.max(used / h.slots, h.maxKg !== undefined ? kg / h.maxKg : 0), max: 1, text: `${used} / ${h.slots} 格 · ${weight}`, tone: 'mid' });
    if (ins) {
      for (let i = 0; i < ins.length && i < INSIDE_ROWS; i++) {
        const x = ins[i];
        const xd = itemDef(x.item);
        const st: FreshStage = xd.perish ? freshStage(freshNow(x, nowS)) : 0;
        card.rows.push({ value: `×${countOf(x)}`, label: st >= 2 ? `${xd.name.zh}（${FRESH_WORD[st].zh}）` : xd.name.zh, ...(st >= 2 ? { tone: 'bad' as const } : {}) });
      }
      if (ins.length > INSIDE_ROWS) card.rows.push({ value: `+${ins.length - INSIDE_ROWS}`, label: '还有别的' });
    } else card.notes.push({ text: '空的', tone: 'info' });
    if (h.decay !== undefined && h.decay !== 1) card.notes.push({ text: h.decay <= 0 ? '放在里面的东西不会坏' : `放在里面的东西坏得${h.decay < 1 ? '慢' : '快'}：平时的 ${Math.round(h.decay * 100)}%`, tone: h.decay < 1 ? 'ok' : 'warn' });
  }
  const s = salvageText(salvageOf(inst));
  if (s) card.rows.push({ value: s, label: '回收能得' });
  // what systems add to the cards of their own kinds
  addLines(LINES_BY_CAT.get(d.cat), `category ${d.cat}`, inst, card, nowS);
  addLines(LINES_BY_ITEM.get(d.id), d.id, inst, card, nowS);
  return card;
}

/** how long a card made for the words on screen is kept at the most while nothing it was made for has changed (s) */
const CARD_KEEP_S = 0.25;

/** a card kept, with what of its thing it was made for */
interface KeptCard {
  card: ItemCard;
  item: string;
  n: number;
  litres: number;
  uses: number;
  q: number;
  /** freshness in fiftieths (−1: it does not go off) */
  fresh: number;
  /** how many stacks are in it, and how many things in all */
  inside: number;
  many: number;
  /** the words' version it was made at (itemWordsChanged) */
  v: number;
  /** when it was made, on the asker's clock */
  t: number;
}

const KEPT = new WeakMap<ItemInstance, KeptCard>();

/**
 * A thing's card for the words on screen, which ask for it every frame: the card made last time, the same
 * object, while nothing it says has changed — its kind, its count, its level, how fresh it is (in fiftieths),
 * what is in it (how many stacks, how many things) — and for CARD_KEEP_S at the most (what the things inside
 * are, how fresh they are and what a system's own lines read is not followed here). So a card costs nothing
 * in the frames between, and a count or a kind that changes shows at once. `t`: the asker's own clock in seconds (the player's).
 * The card is marked `kept`: do not write into it.
 */
export function itemCardKept(inst: ItemInstance, nowS: number, t: number): ItemCard {
  const d = itemDef(inst.item);
  const n = inst.n ?? 1;
  const litres = inst.litres ?? -1;
  const uses = inst.uses ?? -1;
  const q = inst.q ?? 0;
  const fresh = d.perish ? Math.round(freshNow(inst, nowS) * 50) : -1;
  const ins = inst.inside;
  const inside = ins ? ins.length : 0;
  let many = 0;
  if (ins) for (let i = 0; i < ins.length; i++) many += ins[i].n ?? 1;
  let m = KEPT.get(inst);
  if (m && m.item === inst.item && m.n === n && m.litres === litres && m.uses === uses && m.q === q && m.fresh === fresh && m.inside === inside && m.many === many && m.v === wordsVersion && t >= m.t && t - m.t < CARD_KEEP_S) return m.card;
  const card = itemCard(inst, nowS);
  card.kept = true;
  if (!m) {
    m = { card, item: inst.item, n, litres, uses, q, fresh, inside, many, v: wordsVersion, t };
    KEPT.set(inst, m);
    return card;
  }
  m.card = card;
  m.item = inst.item;
  m.n = n;
  m.litres = litres;
  m.uses = uses;
  m.q = q;
  m.fresh = fresh;
  m.inside = inside;
  m.many = many;
  m.v = wordsVersion;
  m.t = t;
  return card;
}

// ------------------------------------------------------------------ vehicles

const KIND_ZH: Record<string, string> = { sedan: '轿车', pickup: '皮卡', moto: '摩托', rv: '房车', van: '面包车', offroad: '越野车', wagon: '旅行车', sports: '跑车', truck: '货车' };

export function vehicleCard(v: ModVehicle): ItemCard {
  const b = v.build;
  const frame = v.view.frame;
  const d = v.sys.derived;
  const card: ItemCard = {
    key: `vehicle:${b.uid}`,
    icon: 'car',
    cat: `车辆 · ${KIND_ZH[frame.kind] ?? ''}`,
    name: frame.name.zh,
    stars: 0,
    badges: [],
    blurb: FRAME_BLURB[frame.id] ?? '',
    rows: [],
    bars: [],
    notes: [],
    foot: { mass: d.mass, cond: b.cond },
  };
  const perf = quickPerf(d);
  if (d.engine) card.rows.push({ value: `${d.peakKw.toFixed(0)} kW`, label: d.engine.name.zh });
  else card.rows.push({ value: '没有', label: '发动机', tone: 'bad' });
  if (d.gearbox) card.rows.push({ value: `${d.gearbox.gearbox!.ratios.length} 挡`, label: d.gearbox.name.zh });
  if (!perf.why) {
    card.rows.push({ value: `${perf.vmax.toFixed(0)} km/h`, label: '最高速度' });
    card.rows.push({ value: perf.t100 === null ? '到不了' : `${perf.t100.toFixed(1)} 秒`, label: '0 到 100 km/h' });
    if (Number.isFinite(perf.fuel)) card.rows.push({ value: `${perf.fuel.toFixed(1)} L`, label: '每百公里油耗' });
  }
  card.rows.push(perf.stop === null ? { value: '刹不住', label: '百公里刹停', tone: 'bad' } : { value: `${perf.stop.toFixed(0)} 米`, label: '百公里刹停' });
  card.rows.push({ value: `${Math.round(perf.clear * 100)} 厘米`, label: '离地间隙' });
  const at = (cat: Category): PartInstance | null => {
    const m = frame.mounts.find((mm) => mm.cat === cat && b.parts[mm.id]);
    return m ? b.parts[m.id] : null;
  };
  const tank = at('fuelTank');
  if (tank) card.bars.push(fuelBar('油箱', tank.fluids.fuel ?? {}, partDef(tank.part).fuelTank!.litres));
  const eng = at('engine');
  if (eng && partDef(eng.part).engine!.oilL > 0) {
    const max = partDef(eng.part).engine!.oilL;
    card.bars.push({ label: '机油', value: eng.fluids.oilL ?? 0, max, text: `${L(eng.fluids.oilL ?? 0)} / ${L(max)} L`, tone: 'oil' });
  }
  const rad = at('radiator');
  if (rad && eng && partDef(eng.part).engine!.cooling === 'water') {
    const max = partDef(rad.part).radiator!.coolantL;
    card.bars.push({ label: '冷却液', value: rad.fluids.coolantL ?? 0, max, text: `${L(rad.fluids.coolantL ?? 0)} / ${L(max)} L`, tone: 'water' });
  }
  const bat = at('battery');
  if (bat) card.bars.push({ label: '电瓶', value: bat.fluids.charge ?? 0, max: 1, text: pct(bat.fluids.charge ?? 0), tone: 'charge' });
  // what it still needs: the blocking problems first, then what it will suffer from
  const block = [...crankProblems(b), ...runProblems(b).filter((p) => p.severity === 'block'), ...driveProblems(b)];
  const warn = [...runProblems(b).filter((p) => p.severity === 'warn'), ...warnings(b)];
  for (const p of block.slice(0, 3)) card.notes.push({ text: p.text.zh, tone: 'warn' });
  if (block.length > 3) card.notes.push({ text: `还有 ${block.length - 3} 个问题`, tone: 'warn' });
  if (!block.length) card.notes.push({ text: '能开：上车，按住 K 打火', tone: 'ok' });
  for (const p of warn.slice(0, block.length ? 1 : 2)) card.notes.push({ text: p.text.zh, tone: 'info' });
  return card;
}

/**
 * A part held up to a mount: the vehicle as it is against the vehicle with the part on it (stats.ts
 * compare), and what would come off into the hands.
 */
export function fitCard(v: ModVehicle, mountLabel: string, inst: PartInstance, lines: StatLine[], replaced: PartInstance | null, warn?: string): ItemCard {
  const frame = v.view.frame;
  const s = (x: StatLine['before']): string => (typeof x === 'string' ? x : x.zh);
  const card: ItemCard = {
    key: `fit:${v.build.uid}:${mountLabel}:${inst.uid}`,
    icon: 'car',
    cat: `装上之后 · ${frame.name.zh}的${mountLabel}`,
    name: partDef(inst.part).name.zh,
    stars: 0,
    badges: replaced ? [{ text: `换下来的 ${partDef(replaced.part).name.zh} 到手上`, tone: 'note' }] : [],
    blurb: '',
    // (only what it changes)
    rows: lines.filter((l) => l.note || s(l.before) !== s(l.after)).map((l) => (l.note ? { value: s(l.after), label: l.label.zh } : { value: s(l.after), from: s(l.before), label: l.label.zh, tone: l.better > 0 ? 'good' : l.better < 0 ? 'bad' : undefined })),
    bars: [],
    notes: warn ? [{ text: warn, tone: 'warn' }] : [],
    foot: {},
  };
  if (!card.rows.length && !warn) card.notes.push({ text: '装上之后各项数值不变', tone: 'info' });
  return card;
}

// ------------------------------------------------------------------ the workshop's machines

export function deviceCard(dv: GarageDevice): ItemCard {
  if (dv.card) return dv.card;
  const info = DEVICE_BLURB[dv.id];
  return {
    key: `device:${dv.id}`,
    icon: 'device',
    cat: '车库设备',
    name: info?.name ?? dv.word.zh,
    stars: 0,
    badges: [],
    blurb: info?.zh ?? '',
    rows: [],
    bars: [],
    notes: [{ text: dv.state?.zh ?? dv.word.zh, tone: 'info' }],
    foot: {},
  };
}

