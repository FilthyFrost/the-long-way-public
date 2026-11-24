/**
 * A new game's start (docs/V3/plan/growth.md §一 1–3, J5): the Sugar Cube a bare shell in the workshop and the
 * rest of it lying about, old; the task board that goes with it, in three groups. Pure data and maths: the game
 * lays the parts out in its workshop (ModGame.populate) and ticks the board off from the car as it stands.
 *
 *   on the shell     the frame and the body, and what is under its floor: the suspension, the brakes, the
 *                    differential, the (empty) fuel tank, and the gearbox and the exhaust — old too (50 %): standing
 *                    by the car one sees neither's place from anywhere (the floor pan is over them), and fitting
 *                    from below waits for the lift's way of doing it
 *   in the workshop  the other twenty-nine: the engine, battery, ignition and radiator, four wheels, the steering
 *                    wheel, three seats, the gear lever, the handbrake, the horn, four doors, the bonnet, the boot
 *                    lid, two bumpers, four lamps, two mirrors — each old (40–70 %), dusty, the odd one rusty; the
 *                    engine the car's own little four at 45 % (it misfires at idle and pulls three quarters of what
 *                    it once did), the steering wheel a worn one with play in it. No radio: that is found down the
 *                    road.
 *   the board        to start: the engine, the battery, the ignition, the radiator and water in it, fuel (the key
 *                    goes with the ones to start: no ignition, no crank); to drive: four wheels, the steering wheel,
 *                    the driver's seat, the gear lever, the handbrake. Those done, the doors open. To be a car: the
 *                    doors, the bonnet, the boot lid, the lamps, the mirrors, the bumpers, the other seats, the horn
 *                    — on the board, not in the way.
 */
import { fitSub, newInstance, stockBuild, stockPartFor, stockTireFor } from './build';
import { frameDef } from './frames';
import type { Build, PartInstance, Text } from './types';

/** the car the journey begins with */
export const START_FRAME = 'sedan';

/** what stays on the shell: the frame's own, under its floor (the plan's "看不见的悬挂、刹车、差速器、油箱"; the gearbox and the exhaust, out of reach standing) */
export const KEPT_ON: readonly string[] = ['fuelTank', 'susp_F', 'susp_R', 'brakes_F', 'brakes_R', 'diff_R', 'gearbox', 'exhaust'];

/** how worn what stays on the shell is (the gearbox, the exhaust: old like the rest) */
const KEPT_COND = 0.5;

/** what is not in the workshop at all: found down the road */
const NOT_HERE = new Set(['radio']);

/** a part that is not the frame's stock one: the worn steering wheel, with play in it (方向有点旷) */
const INSTEAD: Record<string, string> = { steering: 'steer_bad' };

/** how worn the engine is: it misfires at idle (怠速不稳) and gives 0.55 + 0.45 × this of its torque */
export const START_ENGINE_COND = 0.45;

/** where in the workshop a part lies (the game's spots for each) */
export type KitSpot = 'floor' | 'wheels' | 'panels' | 'rack' | 'shelf' | 'charger';

export interface KitPart {
  mount: string;
  inst: PartInstance;
  spot: KitSpot;
}

/** a number 0…1 from a string (the same every time) */
function h01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** the mounts the shell is without, every one with a stock part but what stays on */
export function shellWithout(): string[] {
  const f = frameDef(START_FRAME);
  return f.mounts.filter((m) => !KEPT_ON.includes(m.id) && stockPartFor(f, m)).map((m) => m.id);
}

/** the Sugar Cube as the journey finds it: the shell and what stays on it, the tank dry, the gearbox and exhaust old */
export function bareShell(): Build {
  const b = stockBuild(START_FRAME, { fuel: 0, without: shellWithout() });
  for (const m of ['gearbox', 'exhaust']) if (b.parts[m]) b.parts[m].cond = KEPT_COND;
  return b;
}

const SPOT_OF: Record<string, KitSpot> = {
  engine: 'floor',
  gearbox: 'rack',
  radiator: 'rack',
  exhaust: 'rack',
  battery: 'charger',
  rim: 'wheels',
  seat: 'floor',
  door: 'panels',
  hood: 'panels',
  trunk: 'panels',
  bumperFront: 'rack',
  bumperRear: 'rack',
};

/**
 * The thirty parts that go on the shell, as they lie in the workshop: old (40–70 %), the engine at 45 %, the tyres
 * part worn, the battery half charged on its charger, the radiator dry (the board asks for water), the engine's oil
 * in it. The same every new game.
 */
export function startParts(): KitPart[] {
  const f = frameDef(START_FRAME);
  const tyre = stockTireFor(f);
  const out: KitPart[] = [];
  for (const m of f.mounts) {
    if (KEPT_ON.includes(m.id) || NOT_HERE.has(m.id)) continue;
    const stock = stockPartFor(f, m);
    if (!stock) continue;
    const id = INSTEAD[m.id] ?? stock;
    const k = h01(`start:${m.id}`);
    const cond = m.cat === 'engine' ? START_ENGINE_COND : Math.round((0.4 + 0.3 * k) * 100) / 100;
    const inst = newInstance(id, { cond, charge: 0.5, coolant: 0, oil: 0.85 });
    // (found round the farm: some dustier than others, the steel ones rusty)
    inst.dirt = Math.round((0.2 + 0.4 * h01(`dirt:${m.id}`)) * 100) / 100;
    inst.rust = m.cat === 'rim' || m.cat === 'bumperFront' || m.cat === 'bumperRear' || m.cat === 'exhaust' ? 0.25 + 0.35 * k : 0.06 * k;
    if (m.cat === 'rim' && tyre) fitSub(inst, 'tire', newInstance(tyre, { cond, tread: Math.round((0.8 + 0.15 * h01(`tread:${m.id}`)) * 100) / 100 }));
    const spot: KitSpot = SPOT_OF[m.cat] ?? 'shelf';
    out.push({ mount: m.id, inst, spot });
  }
  return out;
}

// ------------------------------------------------------------------ the board

/** the board's groups: what to do before the car, the three of the car, and the way out */
export type KitGroup = 'prep' | 'start' | 'drive' | 'go' | 'car';

export interface KitStepDef {
  id: string;
  group: KitGroup;
  /** the board's word for it (装上 … in the corner's line) */
  name: Text;
  /** the mounts it asks to be filled; none: a step of its own (water, fuel, the door…) */
  mounts?: readonly string[];
}

export const KIT_GROUPS: readonly { id: KitGroup; name: Text; required: boolean }[] = [
  { id: 'prep', name: { zh: '准备', en: 'First' }, required: true },
  { id: 'start', name: { zh: '能发动', en: 'To start' }, required: true },
  { id: 'drive', name: { zh: '能开', en: 'To drive' }, required: true },
  { id: 'go', name: { zh: '出发', en: 'Off' }, required: true },
  { id: 'car', name: { zh: '像一辆车', en: 'To be a car' }, required: false },
];

const st = (id: string, group: KitGroup, zh: string, en: string, mounts?: readonly string[]): KitStepDef => ({ id, group, name: { zh, en }, ...(mounts ? { mounts } : {}) });

/**
 * The car's steps (the workshop's own before them, the way out after): the plan's three groups, the ignition with
 * the ones to start (no key, no crank: rules.ts crankProblems)
 */
export const KIT_STEPS: readonly KitStepDef[] = [
  st('engine', 'start', '发动机', 'engine', ['engine']),
  st('battery', 'start', '电瓶', 'battery', ['battery']),
  st('ignition', 'start', '钥匙门', 'ignition', ['ignition']),
  st('radiator', 'start', '水箱', 'radiator', ['radiator']),
  st('water', 'start', '水箱加水', 'water in the radiator'),
  st('fuel', 'start', '加油', 'fuel'),
  st('wheels', 'drive', '车轮', 'wheels', ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR']),
  st('steering', 'drive', '方向盘', 'steering wheel', ['steering']),
  st('driverSeat', 'drive', '驾驶座', "driver's seat", ['seat_driver']),
  st('gearLever', 'drive', '挡杆', 'gear lever', ['gearLever']),
  st('handbrake', 'drive', '手刹', 'handbrake', ['handbrake']),
  st('doors', 'car', '车门', 'doors', ['door_FL', 'door_FR', 'door_RL', 'door_RR']),
  st('hood', 'car', '引擎盖', 'bonnet', ['hood']),
  st('trunk', 'car', '后备箱盖', 'boot lid', ['trunk']),
  st('lights', 'car', '灯', 'lamps', ['headlight_L', 'headlight_R', 'taillight_L', 'taillight_R']),
  st('mirrors', 'car', '后视镜', 'mirrors', ['mirror_L', 'mirror_R']),
  st('bumpers', 'car', '保险杠', 'bumpers', ['bumperFront', 'bumperRear']),
  st('seats', 'car', '座椅', 'seats', ['seat_pass', 'seat_rear']),
  st('horn', 'car', '喇叭', 'horn', ['horn']),
];

/** how full the radiator is to count as filled (of what it holds) */
export const WATER_FULL = 0.6;

/** how many of a step's mounts are filled on a build */
export function mountsFilled(b: Build, mounts: readonly string[]): number {
  let n = 0;
  for (const m of mounts) if (b.parts[m]) n++;
  return n;
}

/** the starting junk the recycler takes for the plastic scraper: two boxes of old components and a dead television (20 + 20 + 10) */
export const START_JUNK: readonly string[] = ['crate_parts', 'crate_parts', 'junk_tv_dead'];
