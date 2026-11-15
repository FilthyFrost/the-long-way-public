/**
 * Quirks: the car's temper at low condition (docs/VEHICLE_SYSTEMS.md §6.8). After Pacific Drive's
 * "when [part] [does something], [part] [behaves]" — but light: a quirk is a habit, never a breakdown,
 * and it goes away with the repair. Which quirks a vehicle grows is decided by its seed (deterministic).
 */
import { hash3 } from '../../math/rng';
import type { SlotId } from './partsCatalog';

export type QuirkTrigger = 'always' | 'bump' | 'braking' | 'cold' | 'load' | 'rain' | 'idle';

export interface QuirkDef {
  id: string;
  part: SlotId;
  trigger: QuirkTrigger;
  zh: string;
  en: string;
  /** what the systems do with it (everything else is for the sound and the interior to show) */
  effect: {
    idleWobbleRpm?: number;
    crankExtraS?: number;
    misfire?: boolean;
    brakeBias?: number;
    steerPlayDeg?: number;
    coolingScale?: number;
    headlightFlicker?: boolean;
    radioSkip?: boolean;
    wiperSqueak?: boolean;
    hornDetune?: boolean;
    rattle?: boolean;
    clunk?: boolean;
    brakeSqueal?: boolean;
  };
}

export const QUIRKS: readonly QuirkDef[] = [
  { id: 'idle_hunt', part: 'engine', trigger: 'idle', zh: '怠速时转速忽高忽低', en: 'At idle, the revs hunt up and down', effect: { idleWobbleRpm: 140 } },
  { id: 'cold_start', part: 'engine', trigger: 'cold', zh: '天冷时要多打几下才着', en: 'When it is cold, the starter needs a few more turns', effect: { crankExtraS: 1.4 } },
  { id: 'misfire_load', part: 'engine', trigger: 'load', zh: '大油门时偶尔失火，一顿一顿的', en: 'Under full throttle, it misfires now and then', effect: { misfire: true } },
  { id: 'runs_hot', part: 'cooling', trigger: 'load', zh: '爬坡时水温涨得快', en: 'On climbs, the temperature rises fast', effect: { coolingScale: 0.8 } },
  { id: 'brake_pull', part: 'brakes', trigger: 'braking', zh: '一踩刹车车头往左偏', en: 'When braking, it pulls to the left', effect: { brakeBias: 0.14, brakeSqueal: true } },
  { id: 'brake_squeal', part: 'brakes', trigger: 'braking', zh: '刹车时吱吱叫', en: 'When braking, the brakes squeal', effect: { brakeSqueal: true } },
  { id: 'steering_play', part: 'suspension', trigger: 'always', zh: '方向盘旷了，要多打一点才有反应', en: 'The steering has play: turn a little more before it answers', effect: { steerPlayDeg: 2.2 } },
  { id: 'clunk_bumps', part: 'suspension', trigger: 'bump', zh: '过坎时底盘“咣”一声', en: 'Over bumps, something clunks underneath', effect: { clunk: true } },
  { id: 'headlight_flicker', part: 'body', trigger: 'bump', zh: '颠一下，左大灯就闪', en: 'On a bump, the left headlight flickers', effect: { headlightFlicker: true } },
  { id: 'radio_skip', part: 'body', trigger: 'bump', zh: '颠簸时收音机跳台', en: 'On a bump, the radio jumps a station', effect: { radioSkip: true } },
  { id: 'wiper_squeak', part: 'body', trigger: 'rain', zh: '雨刷吱吱叫', en: 'In the rain, the wipers squeak', effect: { wiperSqueak: true } },
  { id: 'door_rattle', part: 'body', trigger: 'bump', zh: '车门在烂路上咔哒咔哒响', en: 'On rough roads, a door rattles', effect: { rattle: true } },
  { id: 'horn_detune', part: 'battery', trigger: 'always', zh: '喇叭变调了，像只鹅', en: 'The horn has gone off-key, like a goose', effect: { hornDetune: true } },
];

/** condition below which a part grows quirks (5.6) and below which it grows a second one */
export const QUIRK_COND = 40;
export const QUIRK_COND_2 = 20;

const SLOT_INDEX: Record<SlotId, number> = { engine: 1, cooling: 2, battery: 3, suspension: 4, brakes: 5, body: 6, optA: 7, optB: 8, heater: 9 };

/**
 * The quirks a part of this condition shows on the vehicle with this seed. `stockQuirk` = the part is the
 * original tier-I engine, which always has one (5.5: "原装（有小毛病）").
 */
export function quirksFor(seed: number, slot: SlotId, cond: number, stockQuirk = false): QuirkDef[] {
  const pool = QUIRKS.filter((q) => q.part === slot);
  if (pool.length === 0) return [];
  const n = cond < QUIRK_COND_2 ? 2 : cond < QUIRK_COND ? 1 : stockQuirk ? 1 : 0;
  const out: QuirkDef[] = [];
  const start = hash3(seed, SLOT_INDEX[slot], 77) % pool.length;
  for (let k = 0; k < Math.min(n, pool.length); k++) out.push(pool[(start + k) % pool.length]);
  return out;
}
