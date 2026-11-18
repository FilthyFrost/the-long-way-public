/**
 * The proving ground's runs (docs/MODCAR.md §28): each section times and measures a run by itself, from where the
 * vehicle is and what it does — no button to press. A run is ready when the vehicle is at the section's start the
 * right way round; it starts as the section says (moving off the line, crossing the gate, braking past the brake
 * line, onto the circle), measures as it goes, and ends at the section's end or comes to nothing (it left the
 * section, stopped, gave up the brake). What it measured, its trace for comparing, and a line to say it.
 */
import { BRAKE_U, FEATURES, HILL, KM_U, LOOP, LOOP_CORRIDOR, OFFROAD_FINISH, OFFROAD_START, QUARTER_U, SKIDPAD, SLALOM, SLALOM_OUT, START_X, STRAIGHT, loopProject, type SectionId } from './layout';
import { GRAVITY } from '../../vehicle/sim';
import { Trace, type CarState } from './telemetry';
import type { ConeField, ConeGroup } from './cones';

export type RunPhase = 'idle' | 'ready' | 'running' | 'done';

/** a figure a run measured */
export interface Figure {
  key: string;
  zh: string;
  /** its value (NaN: not reached) and how it reads */
  value: number;
  text: string;
  /** which way is better (null: neither) */
  better: 'low' | 'high' | null;
}

export interface RunResult {
  section: SectionId;
  /** it measured what the section measures (false: it came to nothing, `why`) */
  ok: boolean;
  why: string;
  figures: Figure[];
  /** one line to say it */
  line: string;
  trace: Trace;
  /** what the trace's x is */
  xKind: 'time' | 'distance';
  /** when it ended (the game's clock) */
  at: number;
}

const fig = (key: string, zh: string, value: number, unit: string, digits: number, better: Figure['better']): Figure => ({
  key,
  zh,
  value,
  text: Number.isFinite(value) ? `${value.toFixed(digits)}${unit ? ` ${unit}` : ''}` : '—',
  better,
});

/** headings: how far a heading is from a direction (rad, 0…π) */
const off = (h: number, dir: number): number => {
  let d = Math.abs(h - dir) % (2 * Math.PI);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
};
/** −x on the plan */
const WEST = Math.PI;

/** the cones of a run's own (the field's clock) */
export interface ConeCount {
  field: ConeField | null;
  groups: readonly ConeGroup[];
}

export abstract class Run {
  phase: RunPhase = 'idle';
  /** what to tell the driver now */
  hint = '';
  result: RunResult | null = null;
  trace = new Trace();
  /** the game's clock at its start */
  t0 = 0;

  constructor(
    readonly section: SectionId,
    protected readonly cones: ConeField | null = null,
  ) {}

  /** is the vehicle where this run is ready to start */
  abstract ready(c: CarState): boolean;
  /** a frame, once ready or running */
  abstract step(c: CarState): void;
  /** the live line while it runs */
  abstract live(c: CarState): string;
  /** the x of a trace sample now */
  protected abstract traceX(c: CarState): number;
  abstract readonly xKind: 'time' | 'distance';

  /** ready again (a fresh start): forget what it measured */
  arm(): void {
    this.phase = 'ready';
    this.result = null;
    this.trace = new Trace();
  }

  /** stand down (another section's run is on) */
  idle(): void {
    this.phase = 'idle';
  }

  protected begin(c: CarState): void {
    this.phase = 'running';
    this.t0 = c.t;
    this.trace = new Trace();
    this.trace.push(this.traceX(c), c);
  }

  protected sample(c: CarState): void {
    const tr = this.trace;
    if (!tr.length || c.t - tr.t[tr.length - 1] >= 1 / 20) tr.push(this.traceX(c), c);
  }

  protected finish(c: CarState, ok: boolean, why: string, figures: Figure[], line: string): void {
    this.trace.push(this.traceX(c), c);
    this.result = { section: this.section, ok, why, figures, line, trace: this.trace, xKind: this.xKind, at: c.t };
    this.phase = 'done';
  }

  /** the cones of its groups knocked since it started */
  protected conesDown(): number {
    return this.cones ? this.cones.downSince(this.conesOf(), this.t0) : 0;
  }

  protected conesOf(): ConeGroup[] {
    return [];
  }
}

// ------------------------------------------------------------------ 直线加速

/** on the straight, out along −x */
function onStraight(c: CarState, margin = 0.5): boolean {
  return c.x <= STRAIGHT.xNear + 5 && c.x >= STRAIGHT.xFar && Math.abs(c.z) <= STRAIGHT.half + margin;
}

export class AccelRun extends Run {
  readonly xKind = 'time';
  private u0 = 0;
  private t60 = NaN;
  private t100 = NaN;
  private tq = NaN;
  private vq = NaN;
  private tk = NaN;
  private vk = NaN;
  private top = 0;
  private still = 0;

  constructor() {
    super('accel');
  }

  ready(c: CarState): boolean {
    // (at the start line, stopped, facing down the straight)
    return onStraight(c) && START_X - c.x < 60 && START_X - c.x > -20 && c.kmh < 1 && off(c.heading, WEST) < 0.5;
  }

  protected traceX(c: CarState): number {
    return c.t - this.t0;
  }

  step(c: CarState): void {
    if (this.phase === 'ready') {
      this.hint = '踩油门出发：0–60、0–100、400 米、1 公里';
      if (!this.ready(c) && c.kmh < 1) return this.idle();
      if (c.vForward > 0.15) {
        this.u0 = START_X - c.x;
        this.reset();
        this.begin(c);
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    const t = c.t - this.t0;
    const u = START_X - c.x - this.u0;
    if (Number.isNaN(this.t60) && c.kmh >= 60) this.t60 = t;
    if (Number.isNaN(this.t100) && c.kmh >= 100) this.t100 = t;
    if (Number.isNaN(this.tq) && u >= QUARTER_U) {
      this.tq = t;
      this.vq = c.kmh;
    }
    if (c.kmh > this.top) this.top = c.kmh;
    this.still = c.kmh < 1 ? this.still + 1 : 0;
    if (u >= KM_U) {
      this.tk = t;
      this.vk = c.kmh;
      return this.done(c, true, '');
    }
    if (!onStraight(c, 2) || off(c.heading, WEST) > 1.2) return this.done(c, false, '开出了直线道');
    if (this.still > 30) return this.done(c, false, '停下了');
  }

  private reset(): void {
    this.t60 = this.t100 = this.tq = this.vq = this.tk = this.vk = NaN;
    this.top = 0;
    this.still = 0;
  }

  private done(c: CarState, full: boolean, why: string): void {
    const ok = full || Number.isFinite(this.t60);
    const f = [
      fig('t60', '0–60 km/h', this.t60, 's', 2, 'low'),
      fig('t100', '0–100 km/h', this.t100, 's', 2, 'low'),
      fig('tq', '400 米', this.tq, 's', 2, 'low'),
      fig('vq', '400 米时速度', this.vq, 'km/h', 0, 'high'),
      fig('tk', '1 公里', this.tk, 's', 2, 'low'),
      fig('vk', '1 公里时速度', this.vk, 'km/h', 0, 'high'),
      fig('top', '最高速度', this.top, 'km/h', 0, 'high'),
    ];
    const main = Number.isFinite(this.t100) ? `0–100 ${this.t100.toFixed(2)} s` : Number.isFinite(this.t60) ? `0–60 ${this.t60.toFixed(2)} s（没到 100）` : '';
    const line = ok ? [main, Number.isFinite(this.tq) ? `400 米 ${this.tq.toFixed(2)} s / ${this.vq.toFixed(0)} km/h` : '', Number.isFinite(this.tk) ? `1 公里 ${this.tk.toFixed(1)} s` : ''].filter(Boolean).join('，') : `没测成：${why}`;
    this.finish(c, ok, why, f, line);
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    const t = c.t - this.t0;
    const u = START_X - c.x - this.u0;
    return `${t.toFixed(2)} s · ${u.toFixed(0)} m · ${c.kmh.toFixed(0)} km/h${Number.isFinite(this.t100) ? ` · 0–100 ${this.t100.toFixed(2)} s` : Number.isFinite(this.t60) ? ` · 0–60 ${this.t60.toFixed(2)} s` : ''}`;
  }
}

// ------------------------------------------------------------------ 刹车

export class BrakeRun extends Run {
  readonly xKind = 'distance';
  private x0 = 0;
  private z0 = 0;
  private v0 = 0;
  private maxDecel = 0;
  private lockT = 0;
  private yaw0 = 0;
  private lastT = 0;

  constructor() {
    super('brake');
  }

  ready(c: CarState): boolean {
    // (on the straight before the brake line, going down it)
    const u = START_X - c.x;
    return onStraight(c) && u < BRAKE_U - 1 && u > BRAKE_U - 900 && off(c.heading, WEST) < 0.5 && c.vForward > -0.5;
  }

  protected traceX(c: CarState): number {
    return Math.hypot(c.x - this.x0, c.z - this.z0);
  }

  step(c: CarState): void {
    const u = START_X - c.x;
    if (this.phase === 'ready') {
      this.hint = c.kmh < 30 ? `加速，冲过前面 ${Math.max(0, BRAKE_U - u).toFixed(0)} 米的红白刹车线再踩死刹车` : `过了刹车线踩死刹车（还有 ${Math.max(0, BRAKE_U - u).toFixed(0)} 米）`;
      if (!onStraight(c) || off(c.heading, WEST) > 1 || u > BRAKE_U + 60) return this.idle();
      // (braking at or after the line, at speed)
      if (c.brake > 0.6 && u >= BRAKE_U - 3 && c.kmh >= 30) {
        this.x0 = c.x;
        this.z0 = c.z;
        this.v0 = c.kmh;
        this.maxDecel = 0;
        this.lockT = 0;
        this.yaw0 = c.heading;
        this.lastT = c.t;
        this.begin(c);
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    const dt = c.t - this.lastT;
    this.lastT = c.t;
    if (-c.longG > this.maxDecel) this.maxDecel = -c.longG;
    if (c.locked > 0) this.lockT += dt;
    if (c.kmh < 0.5) {
      const d = Math.hypot(c.x - this.x0, c.z - this.z0);
      const d100 = d * (100 / this.v0) ** 2;
      const turn = (off(c.heading, this.yaw0) * 180) / Math.PI;
      const f = [
        fig('v0', '开始刹车时速度', this.v0, 'km/h', 0, null),
        fig('d', '刹停距离', d, 'm', 1, 'low'),
        fig('d100', '折算 100→0', d100, 'm', 1, 'low'),
        fig('t', '刹停用时', c.t - this.t0, 's', 2, 'low'),
        fig('g', '最大减速度', this.maxDecel, 'g', 2, 'high'),
        fig('lock', '车轮抱死时间', this.lockT, 's', 1, 'low'),
        fig('turn', '车头偏了', turn, '°', 1, 'low'),
      ];
      return this.finish(c, true, '', f, `从 ${this.v0.toFixed(0)} km/h 刹停 ${d.toFixed(1)} m（折算 100→0 ${d100.toFixed(1)} m）${this.lockT > 0.3 ? '，车轮抱死了' : ''}`);
    }
    if (c.brake < 0.3 && c.kmh > 5) {
      this.finish(c, false, '中途松了刹车', [], '没测成：中途松了刹车');
      return;
    }
    if (!onStraight(c, 3)) this.finish(c, false, '冲出了直线道', [], '没测成：冲出了直线道');
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    return `刹车中 · ${Math.hypot(c.x - this.x0, c.z - this.z0).toFixed(1)} m · ${c.kmh.toFixed(0)} km/h · ${(-c.longG).toFixed(2)} g`;
  }
}

// ------------------------------------------------------------------ 定圆

/** a lap of the skid pad */
interface Lap {
  t: number;
  g: number;
  slip: number;
}

export class SkidpadRun extends Run {
  readonly xKind = 'time';
  private ang = 0;
  private dir = 0;
  private lapStart = 0;
  private lapAng = 0;
  private clean = true;
  private slip = 0;
  private gSum = 0;
  private gN = 0;
  private outT = 0;
  private lastT = 0;
  readonly laps: Lap[] = [];

  constructor(cones: ConeField | null = null) {
    super('skidpad', cones);
  }

  protected override conesOf(): ConeGroup[] {
    return ['skidpad'];
  }

  /** how far from the lane's middle (m), + outside */
  private dr(c: CarState): number {
    return Math.hypot(c.x - SKIDPAD.x, c.z - SKIDPAD.z) - SKIDPAD.r;
  }

  ready(c: CarState): boolean {
    return Math.abs(this.dr(c)) < SKIDPAD.lane + 1.5;
  }

  protected traceX(c: CarState): number {
    return c.t - this.t0;
  }

  step(c: CarState): void {
    const a = Math.atan2(c.z - SKIDPAD.z, c.x - SKIDPAD.x);
    if (this.phase === 'ready') {
      this.hint = '沿着两条白线中间一直转圈（左转右转都行），每圈计时';
      if (!this.ready(c)) return this.idle();
      if (c.kmh > 8) {
        this.ang = a;
        this.dir = 0;
        this.laps.length = 0;
        this.begin(c);
        this.newLap(c);
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    const dt = c.t - this.lastT;
    this.lastT = c.t;
    let da = a - this.ang;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    this.ang = a;
    if (this.dir === 0 && Math.abs(this.lapAng + da) > 0.2) this.dir = Math.sign(this.lapAng + da);
    this.lapAng += da;
    const dr = this.dr(c);
    if (Math.abs(dr) > SKIDPAD.lane + 0.5 || c.kmh < 5) this.clean = false;
    if (Math.abs(c.slipDeg) > this.slip) this.slip = Math.abs(c.slipDeg);
    this.gSum += Math.abs(c.latG) * dt;
    this.gN += dt;
    // a lap round, the way it goes
    if (this.dir !== 0 && this.lapAng * this.dir >= 2 * Math.PI) {
      const t = c.t - this.lapStart;
      if (this.clean) this.laps.push({ t, g: this.gN > 0 ? this.gSum / this.gN : 0, slip: this.slip });
      this.lapAng -= 2 * Math.PI * this.dir;
      this.newLap(c);
    }
    // off the circle a while: it is over
    this.outT = Math.abs(dr) > SKIDPAD.lane + 4 ? this.outT + dt : 0;
    if (this.outT > 1 || (c.kmh < 1 && c.t - this.lapStart > 3)) this.end(c);
  }

  private newLap(c: CarState): void {
    this.lapStart = c.t;
    this.lastT = c.t;
    this.clean = true;
    this.slip = 0;
    this.gSum = 0;
    this.gN = 0;
    this.outT = 0;
  }

  /** stop measuring (the driver drove off the circle, or the robot is done): the best lap */
  end(c: CarState): void {
    if (this.phase !== 'running') return;
    const best = this.laps.reduce<Lap | null>((b, l) => (!b || l.t < b.t ? l : b), null);
    if (!best) {
      this.finish(c, false, '没有跑完一整圈（要一直在两条白线中间）', [], '没测成：没有跑完一整圈');
      return;
    }
    const R = SKIDPAD.r;
    const v = (2 * Math.PI * R) / best.t;
    const gLap = (v * v) / R / GRAVITY;
    const f = [
      fig('lap', '最快一圈', best.t, 's', 2, 'low'),
      fig('g', '侧向 G（按圈速算）', gLap, 'g', 2, 'high'),
      fig('gMeas', '侧向 G（实测平均）', best.g, 'g', 2, 'high'),
      fig('v', '圈速对应速度', v * 3.6, 'km/h', 1, 'high'),
      fig('slip', '最大打滑角', best.slip, '°', 1, null),
      fig('laps', '跑完的圈数', this.laps.length, '', 0, null),
      fig('cones', '碰倒的桩', this.conesDown(), '', 0, 'low'),
    ];
    this.finish(c, true, '', f, `最快一圈 ${best.t.toFixed(2)} s，${gLap.toFixed(2)} g（${this.dir > 0 ? '右转' : '左转'}，${this.laps.length} 圈）`);
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    const t = c.t - this.lapStart;
    const best = this.laps.length ? Math.min(...this.laps.map((l) => l.t)) : NaN;
    return `第 ${this.laps.length + 1} 圈 ${t.toFixed(1)} s${Number.isFinite(best) ? ` · 最快 ${best.toFixed(2)} s` : ''} · ${Math.abs(c.latG).toFixed(2)} g${this.clean ? '' : ' · 这圈出线了'}`;
  }
}

// ------------------------------------------------------------------ 绕桩

/** the slalom's penalty for a cone knocked or missed (s), as an autocross gives it */
export const CONE_PENALTY = 2;

export class SlalomRun extends Run {
  readonly xKind = 'distance';
  private next = 0;
  private side0 = 0;
  private missed = 0;
  private vIn = 0;
  private maxG = 0;
  private maxSlip = 0;

  constructor(cones: ConeField | null = null) {
    super('slalom', cones);
  }

  protected override conesOf(): ConeGroup[] {
    return ['slalom', 'gate'];
  }

  ready(c: CarState): boolean {
    // (in the slalom's lane before its gate, going down it)
    return Math.abs(c.z - SLALOM.z) < 6 && c.x > SLALOM.gateIn && c.x < START_X + 10 && off(c.heading, WEST) < 0.6;
  }

  protected traceX(c: CarState): number {
    return SLALOM.gateIn - c.x;
  }

  step(c: CarState): void {
    if (this.phase === 'ready') {
      this.hint = `开过进门，左右交替绕过十个桩，出门停表（碰倒、漏过一个桩各加 ${CONE_PENALTY} 秒）`;
      if (!this.ready(c) && c.x > SLALOM.gateIn) return this.idle();
      if (c.x <= SLALOM.gateIn) {
        if (Math.abs(c.z - SLALOM.z) > 4.5) return this.idle();
        this.next = 0;
        this.side0 = 0;
        this.missed = 0;
        this.vIn = c.kmh;
        this.maxG = 0;
        this.maxSlip = 0;
        this.begin(c);
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    if (Math.abs(c.latG) > this.maxG) this.maxG = Math.abs(c.latG);
    if (Math.abs(c.slipDeg) > this.maxSlip) this.maxSlip = Math.abs(c.slipDeg);
    // past a cone: on which side of it (the first sets the way; then each the other side)
    while (this.next < SLALOM.cones && c.x <= SLALOM.first - SLALOM.gap * this.next) {
      const side = Math.sign(c.z - SLALOM.z) || 1;
      if (this.next === 0) this.side0 = side;
      else if (side !== this.side0 * (this.next % 2 === 0 ? 1 : -1)) this.missed++;
      this.next++;
    }
    if (c.x <= SLALOM_OUT) {
      const t = c.t - this.t0;
      const down = this.conesDown();
      const total = t + CONE_PENALTY * (down + this.missed);
      const dist = SLALOM.gateIn - SLALOM_OUT;
      const f = [
        fig('total', '成绩（含罚时）', total, 's', 2, 'low'),
        fig('t', '用时', t, 's', 2, 'low'),
        fig('avg', '平均速度', (dist / t) * 3.6, 'km/h', 1, 'high'),
        fig('vIn', '进门速度', this.vIn, 'km/h', 0, null),
        fig('vOut', '出门速度', c.kmh, 'km/h', 0, 'high'),
        fig('g', '最大侧向 G', this.maxG, 'g', 2, null),
        fig('slip', '最大打滑角', this.maxSlip, '°', 1, null),
        fig('cones', '碰倒的桩', down, '', 0, 'low'),
        fig('missed', '漏过的桩', this.missed, '', 0, 'low'),
      ];
      const pen = down + this.missed;
      return this.finish(c, true, '', f, `${t.toFixed(2)} s${pen ? `（${down ? `碰倒 ${down} 个` : ''}${down && this.missed ? '、' : ''}${this.missed ? `漏过 ${this.missed} 个` : ''}，成绩 ${total.toFixed(2)} s）` : '，一个桩没碰'}，平均 ${((dist / t) * 3.6).toFixed(0)} km/h`);
    }
    if (Math.abs(c.z - SLALOM.z) > 12 || c.x > SLALOM.gateIn + 5 || c.kmh < 1) this.finish(c, false, '开出了绕桩道', [], '没测成：开出了绕桩道');
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    const down = this.conesDown();
    return `${(c.t - this.t0).toFixed(2)} s · 第 ${Math.min(SLALOM.cones, this.next + 1)} 个桩 · ${c.kmh.toFixed(0)} km/h${down || this.missed ? ` · 碰倒 ${down} 漏过 ${this.missed}` : ''}`;
  }
}

// ------------------------------------------------------------------ 越野路段

const lp = { s: 0, d: 0 };

export class OffroadRun extends Run {
  readonly xKind = 'distance';
  private maxRoll = 0;
  private maxPitch = 0;
  private air = 0;
  private lift = 0;
  private bottom = 0;
  private wasBottom = false;
  private stuck = 0;
  private lastT = 0;
  private splits: { zh: string; t: number }[] = [];
  private feature = 0;

  constructor(cones: ConeField | null = null) {
    super('offroad', cones);
  }

  protected override conesOf(): ConeGroup[] {
    return ['offroad'];
  }

  ready(c: CarState): boolean {
    loopProject(c.x, c.z, lp);
    return lp.s < OFFROAD_START && lp.s > OFFROAD_START - 60 && Math.abs(lp.d) < LOOP_CORRIDOR && off(c.heading, WEST) < 0.6;
  }

  protected traceX(c: CarState): number {
    loopProject(c.x, c.z, lp);
    return lp.s - OFFROAD_START;
  }

  step(c: CarState): void {
    loopProject(c.x, c.z, lp);
    if (this.phase === 'ready') {
      this.hint = '开过起点线：搓板路、连续起伏、交叉坑、碎石滩、侧坡、原木，到终点线停表';
      if (!this.ready(c) && lp.s < OFFROAD_START) return this.idle();
      if (lp.s >= OFFROAD_START && lp.s < OFFROAD_START + 10) {
        this.maxRoll = this.maxPitch = this.air = this.lift = 0;
        this.bottom = 0;
        this.wasBottom = false;
        this.stuck = 0;
        this.splits = [];
        this.feature = 0;
        this.lastT = c.t;
        this.begin(c);
      } else if (lp.s >= OFFROAD_START + 10) this.idle();
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    const dt = c.t - this.lastT;
    this.lastT = c.t;
    if (Math.abs(c.rollDeg) > this.maxRoll) this.maxRoll = Math.abs(c.rollDeg);
    if (Math.abs(c.pitchDeg) > this.maxPitch) this.maxPitch = Math.abs(c.pitchDeg);
    if (c.contacts === 0) this.air += dt;
    if (c.contacts > 0 && c.contacts < 4) this.lift += dt;
    if (c.bottomed > 0 && !this.wasBottom) this.bottom++;
    this.wasBottom = c.bottomed > 0;
    this.stuck = c.kmh < 1 ? this.stuck + dt : 0;
    // (each feature's split as it is left behind)
    const out = FEATURES.filter((f) => f.s1 <= OFFROAD_FINISH);
    while (this.feature < out.length && lp.s >= out[this.feature].s1) {
      this.splits.push({ zh: out[this.feature].zh, t: c.t - this.t0 });
      this.feature++;
    }
    if (lp.s >= OFFROAD_FINISH) {
      const t = c.t - this.t0;
      const dist = OFFROAD_FINISH - OFFROAD_START;
      const f = [
        fig('t', '用时', t, 's', 1, 'low'),
        fig('avg', '平均速度', (dist / t) * 3.6, 'km/h', 1, 'high'),
        fig('roll', '最大侧倾', this.maxRoll, '°', 1, null),
        fig('pitch', '最大俯仰', this.maxPitch, '°', 1, null),
        fig('lift', '有轮子离地', this.lift, 's', 1, 'low'),
        fig('air', '四轮腾空', this.air, 's', 2, null),
        fig('bottom', '悬挂到底', this.bottom, '次', 0, 'low'),
        ...this.splits.map((s, i) => fig(`split${i}`, `过完${s.zh}`, s.t, 's', 1, 'low')),
      ];
      return this.finish(c, true, '', f, `${t.toFixed(1)} s，平均 ${((dist / t) * 3.6).toFixed(0)} km/h，最大侧倾 ${this.maxRoll.toFixed(0)}°，悬挂到底 ${this.bottom} 次`);
    }
    if (Math.abs(lp.d) > LOOP_CORRIDOR + 6) return this.finish(c, false, '开出了越野路', [], '没测成：开出了越野路');
    if (this.stuck > 6) this.finish(c, false, '卡住了', [], `没测成：卡在第 ${lp.s.toFixed(0)} 米`);
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    loopProject(c.x, c.z, lp);
    const here = FEATURES.find((f) => lp.s >= f.s0 && lp.s <= f.s1);
    return `${(c.t - this.t0).toFixed(1)} s · ${Math.max(0, lp.s - OFFROAD_START).toFixed(0)} / ${OFFROAD_FINISH - OFFROAD_START} m${here ? ` · ${here.zh}` : ''} · 侧倾 ${c.rollDeg.toFixed(0)}°`;
  }
}

// ------------------------------------------------------------------ 坡道

export class HillRun extends Run {
  readonly xKind = 'distance';
  private ramp = 0;
  private best = 0;
  private stops = 0;
  private wasStill = false;
  private minKmh = Infinity;
  private lastT = 0;
  private down = 0;
  private stall = 0;

  constructor() {
    super('hill');
  }

  /** the ramp lane the vehicle is in (−1: none) */
  private lane(c: CarState): number {
    return HILL.ramps.findIndex((r) => Math.abs(c.z - r.z) < HILL.lane / 2 + 0.3);
  }

  ready(c: CarState): boolean {
    const u = HILL.x0 - c.x;
    return this.lane(c) >= 0 && u < 0 && u > -40 && off(c.heading, WEST) < 0.6;
  }

  protected traceX(c: CarState): number {
    return HILL.x0 - c.x;
  }

  step(c: CarState): void {
    const u = HILL.x0 - c.x;
    if (this.phase === 'ready') {
      this.hint = '开上坡道（20%、30%、40% 三条），可以在坡上停住再起步，到坡顶停表';
      if (!this.ready(c) && u < 0) return this.idle();
      if (u >= 0) {
        const k = this.lane(c);
        if (k < 0) return this.idle();
        this.ramp = k;
        this.best = 0;
        this.stops = 0;
        this.wasStill = false;
        this.minKmh = Infinity;
        this.down = 0;
        this.stall = 0;
        this.lastT = c.t;
        this.begin(c);
      }
      return;
    }
    if (this.phase !== 'running') return;
    this.sample(c);
    const dt = c.t - this.lastT;
    this.lastT = c.t;
    const r = HILL.ramps[this.ramp];
    const up = HILL.rise / r.grade;
    if (u > this.best) this.best = u;
    if (c.kmh < this.minKmh) this.minKmh = c.kmh;
    const still = c.kmh < 0.5;
    if (still && !this.wasStill) this.stops++;
    this.wasStill = still;
    // (rolling back down a metre and more: it could not hold it; or standing with the throttle down, the wheels spinning)
    this.down = this.best - u > 1 ? this.down + dt : 0;
    this.stall = still && c.throttle > 0.8 ? this.stall + dt : 0;
    const pct = Math.round(r.grade * 100);
    if (u >= up + HILL.top / 2) {
      const t = c.t - this.t0;
      const f = [
        fig('grade', '坡度', pct, '%', 0, null),
        fig('t', '爬到坡顶用时', t, 's', 1, 'low'),
        fig('min', '坡上最低速度', this.minKmh, 'km/h', 1, null),
        fig('stops', '坡上停了几次', this.stops, '次', 0, null),
      ];
      return this.finish(c, true, '', f, `${pct}% 的坡 ${t.toFixed(1)} s 爬上去了${this.stops ? `（中间停了 ${this.stops} 次又起步）` : ''}`);
    }
    if (this.down > 1.5 || this.stall > 4) {
      const h = Math.min(HILL.rise, this.best * r.grade);
      return this.finish(c, false, '爬不上去', [fig('grade', '坡度', pct, '%', 0, null), fig('h', '最高爬到', h, 'm', 1, 'high')], `${pct}% 的坡爬不上去：最高到 ${h.toFixed(1)} m（坡顶 ${HILL.rise} m）`);
    }
    if (Math.abs(c.z - r.z) > HILL.lane / 2 + 2) this.finish(c, false, '开出了坡道', [], '没测成：开出了坡道');
  }

  live(c: CarState): string {
    if (this.phase !== 'running') return this.hint;
    const r = HILL.ramps[this.ramp];
    const u = HILL.x0 - c.x;
    return `${Math.round(r.grade * 100)}% 坡 · ${(c.t - this.t0).toFixed(1)} s · 高 ${Math.max(0, Math.min(HILL.rise, u * r.grade)).toFixed(1)} m · ${c.kmh.toFixed(0)} km/h`;
  }
}

// ------------------------------------------------------------------ all of them

/**
 * The runs of every section: the one the vehicle is ready for or running, the others idle. One at a time: while a
 * run runs, the others wait.
 */
export class Runs {
  readonly list: Run[];
  /** the run that is ready or running (null: none) */
  current: Run | null = null;
  /** every run that ended, the newest last */
  readonly results: RunResult[] = [];
  /** a run ended this frame */
  justDone: RunResult | null = null;

  constructor(cones: ConeField | null = null) {
    this.list = [new AccelRun(), new BrakeRun(), new SkidpadRun(cones), new SlalomRun(cones), new OffroadRun(cones), new HillRun()];
  }

  of(id: SectionId): Run {
    return this.list.find((r) => r.section === id)!;
  }

  /** a frame of the vehicle being driven (null: nobody drives one there) */
  step(c: CarState | null): void {
    this.justDone = null;
    const cur = this.current;
    if (!c) {
      if (cur && cur.phase !== 'running') cur.idle();
      if (cur?.phase === 'idle') this.current = null;
      return;
    }
    if (cur && (cur.phase === 'ready' || cur.phase === 'running')) {
      cur.step(c);
      // (as the step left it)
      const ph = cur.phase as RunPhase;
      if (ph === 'done') this.ended(cur);
      else if (ph === 'idle') this.current = null;
      if (this.current && this.current.phase !== 'idle') return;
    }
    // (none ready: the first section the vehicle is at the start of — not the one just run, until the vehicle has
    // stopped or left it: the skid pad's circle is its own start)
    if (this.rest) {
      if (c.kmh < 1 || !this.rest.ready(c)) this.rest = null;
    }
    for (const r of this.list) {
      if (r === this.rest) continue;
      if (r.ready(c)) {
        r.arm();
        this.current = r;
        r.step(c);
        if (r.phase === 'done') this.ended(r);
        return;
      }
    }
    this.current = null;
  }

  private ended(r: Run): void {
    if (r.result) {
      this.results.push(r.result);
      this.justDone = r.result;
    }
    this.current = null;
    this.rest = r;
    r.idle();
  }

  /** the run that just ended: not ready again until the vehicle has stopped or left its start */
  private rest: Run | null = null;

  /** stop the run that runs (the skid pad's ends with its best lap; the others come to nothing) */
  stop(c: CarState): void {
    const r = this.current;
    if (!r || r.phase !== 'running') return;
    if (r instanceof SkidpadRun) r.end(c);
    if ((r.phase as RunPhase) === 'done') this.ended(r);
    else {
      r.idle();
      this.current = null;
    }
  }

  /** what to tell the driver now ('' none) */
  line(c: CarState): string {
    const r = this.current;
    return r ? r.live(c) : '';
  }
}
