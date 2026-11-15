/**
 * What stops a build from starting or driving, and what it will suffer from (docs/MODCAR.md §3), each in
 * one sentence a player understands. The ignition self-check, the mount hints and the systems read these.
 */
import { frameDef, hubsOf } from './frames';
import { partDef } from './parts';
import { tankFuel } from './derive';
import type { Build, PartDef, Text } from './types';

export type ProblemCode =
  | 'no_battery'
  | 'battery_flat'
  | 'no_ignition'
  | 'no_engine'
  | 'no_tank'
  | 'no_fuel'
  | 'wrong_fuel'
  | 'no_oil'
  | 'no_gearbox'
  | 'no_driver_seat'
  | 'no_driven_wheel'
  | 'no_steering'
  | 'no_wheel'
  | 'no_tire'
  | 'flat_tire'
  | 'no_radiator'
  | 'low_coolant'
  | 'two_stroke_oil'
  | 'fuel_mixed'
  | 'no_handbrake'
  | 'no_gearlever'
  | 'no_headlights';

export interface Problem {
  code: ProblemCode;
  /** block = it will not start / will not drive; warn = it will, but something will go wrong */
  severity: 'block' | 'warn';
  mount?: string;
  text: Text;
}

const T = (zh: string, en: string): Text => ({ zh, en });

function partAt(build: Build, mountId: string): PartDef | null {
  const i = build.parts[mountId];
  return i ? partDef(i.part) : null;
}

function firstMountOf(build: Build, cat: PartDef['cat']): string | null {
  return frameDef(build.frame).mounts.find((m) => m.cat === cat)?.id ?? null;
}

/** the battery's charge 0…1 (0 when there is none) */
export function batteryCharge(build: Build): number {
  const id = firstMountOf(build, 'battery');
  const inst = id ? build.parts[id] : undefined;
  return inst ? (inst.fluids.charge ?? 0) : 0;
}

export interface FuelQuality {
  /** the engine runs on what is in the tank */
  runs: boolean;
  /** share of its power it makes on it */
  power: number;
  /** extra wear per hour of running (a two-stroke on pure petrol) */
  wear: number;
  /** share of the wrong fuel in the tank */
  wrong: number;
}

/** how an engine gets on with what is in the tank */
export function fuelQuality(engine: PartDef, build: Build): FuelQuality {
  const f = tankFuel(build);
  if (f.total <= 1e-6) return { runs: false, power: 0, wear: 0, wrong: 0 };
  const want = engine.engine!.fuel;
  let wrong: number;
  let wear = 0;
  if (want === 'diesel') wrong = (f.petrol + f.mix2t) / f.total;
  else if (want === 'petrol') wrong = f.diesel / f.total;
  else {
    // a two-stroke wants its oil mixed in: plain petrol runs, but it eats the engine
    wrong = f.diesel / f.total;
    wear = (f.petrol / f.total) * 0.6;
  }
  const runs = wrong < 0.3;
  const power = runs ? 1 - wrong * 2.2 : 0;
  return { runs, power: Math.max(0, power), wear, wrong };
}

/** what keeps the starter from turning the engine over */
export function crankProblems(build: Build): Problem[] {
  const out: Problem[] = [];
  const bat = firstMountOf(build, 'battery');
  if (!bat || !build.parts[bat]) out.push({ code: 'no_battery', severity: 'block', mount: bat ?? undefined, text: T('没有电瓶：什么都不亮，也打不着火。', 'No battery: nothing lights up and it will not crank.') });
  else if (batteryCharge(build) < 0.08) out.push({ code: 'battery_flat', severity: 'block', mount: bat, text: T('电瓶没电了：充一充，或者换一个。', 'The battery is flat: charge it or swap it.') });
  const ign = firstMountOf(build, 'ignition');
  if (!ign || !build.parts[ign]) out.push({ code: 'no_ignition', severity: 'block', mount: ign ?? undefined, text: T('没有点火开关：钥匙插不进去。', 'No ignition switch: there is nowhere to turn a key.') });
  const eng = firstMountOf(build, 'engine');
  if (!eng || !build.parts[eng]) out.push({ code: 'no_engine', severity: 'block', mount: eng ?? undefined, text: T('没有发动机：这辆车只能推。', 'No engine: this one only goes if you push it.') });
  return out;
}

/** what keeps a cranking engine from catching and running */
export function runProblems(build: Build): Problem[] {
  const out: Problem[] = [];
  const engMount = firstMountOf(build, 'engine');
  const eng = engMount ? partAt(build, engMount) : null;
  if (!eng) return out;
  const tank = firstMountOf(build, 'fuelTank');
  if (!tank || !build.parts[tank]) {
    out.push({ code: 'no_tank', severity: 'block', mount: tank ?? undefined, text: T('没有油箱：发动机喝不到油。', 'No fuel tank: the engine has nothing to drink.') });
    return out;
  }
  const q = fuelQuality(eng, build);
  if (tankFuel(build).total <= 1e-6) out.push({ code: 'no_fuel', severity: 'block', mount: tank, text: T('油箱是空的。', 'The tank is empty.') });
  else if (!q.runs) {
    const zh = eng.engine!.fuel === 'diesel' ? '柴油机里是汽油：突突两下就熄。' : '汽油机里是柴油：突突两下就熄。';
    const en = eng.engine!.fuel === 'diesel' ? 'Petrol in a diesel: it coughs twice and dies.' : 'Diesel in a petrol engine: it coughs twice and dies.';
    out.push({ code: 'wrong_fuel', severity: 'block', mount: tank, text: T(zh, en) });
  } else if (q.wrong > 0.05) out.push({ code: 'fuel_mixed', severity: 'warn', mount: tank, text: T('油里混了别的油：没劲，还会喘。', 'Mixed fuel: it runs weak and stutters.') });
  if (q.wear > 0.05) out.push({ code: 'two_stroke_oil', severity: 'warn', mount: tank, text: T('二冲程机要加混合油：纯汽油会拉缸。', 'A two-stroke wants oil in its petrol: plain petrol will seize it.') });
  const inst = engMount ? build.parts[engMount] : undefined;
  if (eng.engine!.oilL > 0 && (inst?.fluids.oilL ?? 0) < eng.engine!.oilL * 0.15) out.push({ code: 'no_oil', severity: 'block', mount: engMount ?? undefined, text: T('发动机没有机油了：先加机油。', 'The engine is out of oil: top it up first.') });
  return out;
}

/** what keeps a running vehicle from moving off */
export function driveProblems(build: Build): Problem[] {
  const out: Problem[] = [];
  const frame = frameDef(build.frame);
  const gb = firstMountOf(build, 'gearbox');
  if (!gb || !build.parts[gb]) out.push({ code: 'no_gearbox', severity: 'block', mount: gb ?? undefined, text: T('没有变速箱：发动机空转，车不走。', 'No gearbox: the engine revs and nothing moves.') });
  const seat = frame.mounts.find((m) => m.driver);
  if (seat && !build.parts[seat.id]) out.push({ code: 'no_driver_seat', severity: 'block', mount: seat.id, text: T('驾驶位没有座椅：够不着踏板。', 'No seat at the wheel: you cannot reach the pedals.') });
  const hubs = frame.mounts.filter((m) => m.cat === 'rim' && m.driven);
  if (hubs.length && hubs.every((h) => !build.parts[h.id])) out.push({ code: 'no_driven_wheel', severity: 'block', mount: hubs[0].id, text: T('驱动轮一个都没有：发动机的劲没处使。', 'No driven wheels at all: the power has nowhere to go.') });
  return out;
}

/** what the vehicle will run with but suffer from */
export function warnings(build: Build): Problem[] {
  const out: Problem[] = [];
  const frame = frameDef(build.frame);
  const steer = firstMountOf(build, 'steering');
  if (steer && !build.parts[steer]) out.push({ code: 'no_steering', severity: 'warn', mount: steer, text: T('没有方向盘：只能直着开。', 'No steering wheel: straight ahead only.') });
  const h = hubsOf(frame);
  const seen = new Set<string>();
  for (const hub of [h.fl, h.fr, h.rl, h.rr]) {
    if (seen.has(hub.id)) continue;
    seen.add(hub.id);
    const inst = build.parts[hub.id];
    if (!inst) {
      out.push({ code: 'no_wheel', severity: 'warn', mount: hub.id, text: T(`${hub.label.zh}没有车轮：那个角拖在地上。`, `No ${hub.label.en}: that corner drags on the road.`) });
      continue;
    }
    const rim = partDef(inst.part).rim;
    if (rim?.tire && !inst.sub.tire) out.push({ code: 'no_tire', severity: 'warn', mount: hub.id, text: T(`${hub.label.zh}只有钢圈：又滑又吵。`, `The ${hub.label.en} is a bare rim: slippery and loud.`) });
    else if (inst.sub.tire?.flat) out.push({ code: 'flat_tire', severity: 'warn', mount: hub.id, text: T(`${hub.label.zh}扎胎了：车往这边偏。`, `The ${hub.label.en} is flat: the car pulls that way.`) });
  }
  const engMount = firstMountOf(build, 'engine');
  const eng = engMount ? partAt(build, engMount) : null;
  if (eng?.engine?.cooling === 'water') {
    const rad = firstMountOf(build, 'radiator');
    const ri = rad ? build.parts[rad] : undefined;
    if (!ri) out.push({ code: 'no_radiator', severity: 'warn', mount: rad ?? undefined, text: T('水冷发动机没有散热器：几分钟就开锅。', 'A water-cooled engine with no radiator: it boils within minutes.') });
    else {
      const rs = partDef(ri.part).radiator!;
      if ((ri.fluids.coolantL ?? 0) < rs.coolantL * 0.3) out.push({ code: 'low_coolant', severity: 'warn', mount: rad ?? undefined, text: T('散热器缺水：加点水。', 'The radiator is low: add some water.') });
    }
  }
  const hb = firstMountOf(build, 'handbrake');
  if (hb && !build.parts[hb]) out.push({ code: 'no_handbrake', severity: 'warn', mount: hb, text: T('没有手刹：停在坡上会溜。', 'No handbrake: it rolls away on a slope.') });
  const gl = firstMountOf(build, 'gearLever');
  if (gl && !build.parts[gl] && build.parts[firstMountOf(build, 'gearbox') ?? '']) out.push({ code: 'no_gearlever', severity: 'warn', mount: gl, text: T('没有挡杆：卡在一挡，倒不了车。', 'No gear lever: stuck in first, no reverse.') });
  const lamps = frame.mounts.filter((m) => m.cat === 'headlight');
  if (lamps.length && lamps.every((m) => !build.parts[m.id])) out.push({ code: 'no_headlights', severity: 'warn', mount: lamps[0].id, text: T('没有大灯：天黑就看不见路。', 'No headlamps: blind after dark.') });
  return out;
}

/** everything, blocking problems first: the self-check reads the first one aloud */
export function allProblems(build: Build): Problem[] {
  return [...crankProblems(build), ...runProblems(build), ...driveProblems(build), ...warnings(build)];
}

export function canStart(build: Build): boolean {
  return !crankProblems(build).length && !runProblems(build).some((p) => p.severity === 'block');
}

export function canDrive(build: Build): boolean {
  return canStart(build) && !driveProblems(build).length;
}
