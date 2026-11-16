/**
 * The item cards' contents (docs/MODCAR.md §5.5): what a part, a tool, a vehicle or a workshop machine is,
 * what it is for and how it stands — its grade, one line about it, its numbers (an engine's torque curve, a
 * tyre's grip on each ground), what is in it (fuel by kind, oil, water, charge) as bars, its condition and
 * weight, the vehicles it fits. Plain data; cards.ts draws it. The held thing's card and the card of what
 * the mark is on are both made here.
 */
import { DEVICE_BLURB, FRAME_BLURB, PART_BLURB, TOOL_BLURB } from '../../core/modcar/blurbs';
import { mountsFor } from '../../core/modcar/build';
import { boostedCurve } from '../../core/modcar/derive';
import { CAT_LABEL, FRAMES } from '../../core/modcar/frames';
import { PALETTE } from '../../core/modcar/palette';
import { partDef, PARTS } from '../../core/modcar/parts';
import { crankProblems, driveProblems, runProblems, warnings } from '../../core/modcar/rules';
import { quickPerf, type StatLine } from '../../core/modcar/stats';
import { TOOL_INFO, type Tool } from '../../core/modcar/tools';
import type { Category, FuelType, PartDef, PartInstance } from '../../core/modcar/types';
import type { GarageDevice } from './garageStub';
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
}

export interface CardRow {
  /** the number, first and bold ("44 kW") */
  value: string;
  label: string;
  tone?: 'good' | 'bad';
  /** what it was before (a part held up to a mount: before → after) */
  from?: string;
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

export type CardIcon = 'engine' | 'wheel' | 'body' | 'cab' | 'electric' | 'tool' | 'car' | 'device';

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
  return t.kind === 'spray' ? 0.4 : 0.1;
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
function fuelBar(label: string, fuel: Partial<Record<FuelType, number>>, max: number): CardBar {
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
      card.bars.push({ label: '胎纹', value: t.tread ?? 1, max: 1, text: pct(t.tread ?? 1), tone: condTone(t.tread ?? 1) });
      if (t.flat) card.notes.push({ text: '轮胎扎破了：车会往这边偏', tone: 'warn' });
    } else card.notes.push({ text: '只有钢圈，没装轮胎：又滑又吵', tone: 'warn' });
  }
  if (def.tire) {
    const t = def.tire;
    card.columns = { label: '各种路面的抓地', items: t.grip.map((g, i) => ({ label: SURFACES_ZH[i], value: g })), max: 1.6 };
    row(`${(t.wear * 100).toFixed(1)}%`, '每百公里磨掉的胎纹');
    card.bars.push({ label: '胎纹', value: inst.tread ?? 1, max: 1, text: pct(inst.tread ?? 1), tone: condTone(inst.tread ?? 1) });
    if (inst.flat) card.notes.push({ text: '扎破了：装上去车会往这边偏', tone: 'warn' });
  }
  if (def.steering) {
    const s = def.steering;
    row(s.bar ? '车把' : `${s.ratio} : 1`, s.bar ? '转向' : '转向比（越小越灵）');
    row(`${s.playDeg}°`, '虚位（越小越跟手）');
  }
  if (def.seat) {
    row(pct(def.seat.comfort), '舒适');
    if (def.seat.swivel) row('能', '转圈');
  }
  if (def.radio) {
    row(def.radio.tape ? '能' : '不能', '放磁带');
    row(`${def.radio.watts} W`, '功率');
  }
  if (def.handbrake) row(`×${def.handbrake.strength}`, '刹住后轮的力气');
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
  if (inst.rust > 0.25) card.notes.push({ text: `锈了 ${pct(inst.rust)}：用海绵擦一擦`, tone: 'info' });
  else if (inst.dirt > 0.4) card.notes.push({ text: '有点脏：用海绵擦一擦', tone: 'info' });
  return card;
}

// ------------------------------------------------------------------ tools

export function toolCard(t: Tool): ItemCard {
  const info = TOOL_INFO[t.kind];
  const blurb = TOOL_BLURB[t.kind];
  const card: ItemCard = {
    key: `tool:${t.uid}:${t.kind}:${t.fuel ?? ''}:${t.colour ?? ''}`,
    icon: 'tool',
    cat: '工具',
    name: t.kind === 'jerrycan' ? `油桶（${FUEL_ZH[t.fuel ?? 'petrol']}）` : info.name.zh,
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
    card.rows.push({ value: PALETTE[t.colour ?? 0]?.name.zh ?? '', label: '现在的颜色（滚轮换）' });
  }
  return card;
}

// ------------------------------------------------------------------ vehicles

const KIND_ZH: Record<string, string> = { sedan: '轿车', pickup: '皮卡', moto: '摩托', rv: '房车' };

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

