/**
 * The workshop's machines at work (docs/MODCAR.md §9): the lift goes up and down, the tyre changer
 * puts a tyre on a wheel lying on its turntable (or takes it off), the radio plays (silently, for now:
 * its dial lights and the pointer finds a station), the sink fills the water bottle, the paint gun on
 * its long hose gives the car standing nearest a whole new coat in the colour of the can in hand, the
 * clock keeps the day's time, the fan turns.
 *
 * Each is a GarageDevice (aim point, word, use) plus a little state stepped every frame.
 */
import type * as THREE from 'three';
import { fitSub, removeSub } from '../../core/modcar/build';
import { PALETTE } from '../../core/modcar/palette';
import { partDef } from '../../core/modcar/parts';
import { TOOL_INFO } from '../../core/modcar/tools';
import type { Text } from '../../core/modcar/types';
import type { GarageContext, GarageDevice } from './garageStub';
import type { GarageLook } from './garageLook';
import type { Loose } from './loose';

const text = (zh: string, en: string): Text => ({ zh, en });

/** what the machines need of the garage */
export interface MachineRig {
  movers: Map<string, THREE.Object3D>;
  rest: Map<string, THREE.Vector3>;
  look: GarageLook;
  device(id: string): { x: number; y: number; z: number; radius: number } | null;
  surface(name: string): { x0: number; x1: number; z0: number; z1: number; y: number } | null;
}

/** made-up station names and songs the radio "plays" (it is silent for now) */
const SONGS = ['「晚风吹过加油站」', '「老路上的月亮」', '「拖拉机进城」', '「明天还要往西开」', '「雨刷器华尔兹」'];

export class Machines {
  readonly devices: GarageDevice[] = [];
  private ctx: GarageContext | null = null;
  private t = 0;
  // the lift
  private liftT = 0;
  private liftTarget = 0;
  // the tyre changer: a job under way (seconds left) and what to do at its end
  private tcLeft = 0;
  private tcJob: (() => void) | null = null;
  private tcSpin = 0;
  // the radio
  radioOn = false;
  private radioNeedle = 0;
  private song = 0;
  // the paint gun
  private paintLeft = 0;
  private paintJob: (() => void) | null = null;

  constructor(private readonly rig: MachineRig) {
    const self = this;
    const add = (id: string, word: () => Text, use: () => void): void => {
      const d = rig.device(id);
      if (!d) return;
      this.devices.push({
        id,
        x: d.x,
        y: d.y,
        z: d.z,
        radius: d.radius,
        get word(): Text {
          return word();
        },
        use,
      });
    };
    add(
      'lift',
      () => (self.liftTarget > 0.5 ? text('举升机 · 降下', 'Lift · lower') : text('举升机 · 升起', 'Lift · raise')),
      () => {
        this.liftTarget = this.liftTarget > 0.5 ? 0 : 1;
        this.ctx?.sound('lever');
      },
    );
    add('tyrechanger', () => this.tyreWord(), () => this.tyreUse());
    add(
      'radio',
      () => (self.radioOn ? text(`收音机 · ${SONGS[self.song]} · 关掉`, 'Radio · turn it off') : text('打开收音机', 'Turn the radio on')),
      () => {
        this.radioOn = !this.radioOn;
        if (this.radioOn) this.song = (this.song + 1) % SONGS.length;
        this.ctx?.sound('key');
        if (this.radioOn) this.ctx?.ui.say(`收音机里正放着${SONGS[this.song]}。（声音以后再接上）`, 3);
      },
    );
    add('sink', () => this.sinkWord(), () => this.sinkUse());
    add('paintbooth', () => this.paintWord(), () => this.paintUse());
  }

  // ------------------------------------------------------------------ the tyre changer

  /** the wheel lying on the turntable, if any */
  private wheelOnTable(): Loose | null {
    const s = this.rig.surface('tyrechanger');
    const loose = this.ctx?.loose;
    if (!s || !loose) return null;
    for (const l of loose.list) {
      if (!l.part || partDef(l.part.part).cat !== 'rim') continue;
      if (l.x > s.x0 - 0.1 && l.x < s.x1 + 0.1 && l.z > s.z0 - 0.1 && l.z < s.z1 + 0.1 && Math.abs(l.y - s.y) < 0.35) return l;
    }
    return null;
  }

  private tyreWord(): Text {
    if (this.tcLeft > 0) return text('换胎机 · 正在转……', 'Tyre changer · turning…');
    const w = this.wheelOnTable();
    const held = this.ctx?.player.held;
    if (!w?.part) return text('换胎机 · 把一个车轮放到转台上', 'Tyre changer · put a wheel on the table');
    const rim = partDef(w.part.part);
    if (!rim.rim?.tire) return text(`换胎机 · ${rim.name.zh}装不了轮胎`, `Tyre changer · ${rim.name.en} takes no tyre`);
    const tyre = held?.kind === 'part' && partDef(held.inst.part).cat === 'tire' ? held.inst : null;
    if (tyre) return w.part.sub.tire ? text(`换胎机 · 换上${partDef(tyre.part).name.zh}`, `Tyre changer · swap in the ${partDef(tyre.part).name.en}`) : text(`换胎机 · 装上${partDef(tyre.part).name.zh}`, `Tyre changer · fit the ${partDef(tyre.part).name.en}`);
    if (held) return text('换胎机 · 先空出手来', 'Tyre changer · hands full');
    if (w.part.sub.tire) return text(`换胎机 · 拆下${partDef(w.part.sub.tire.part).name.zh}`, `Tyre changer · take the ${partDef(w.part.sub.tire.part).name.en} off`);
    return text('换胎机 · 拿一个轮胎来', 'Tyre changer · bring a tyre');
  }

  private tyreUse(): void {
    const ctx = this.ctx;
    if (!ctx || this.tcLeft > 0) return;
    const w = this.wheelOnTable();
    if (!w?.part || !partDef(w.part.part).rim?.tire) return;
    const held = ctx.player.held;
    const wheel = w.part;
    const tyre = held?.kind === 'part' && partDef(held.inst.part).cat === 'tire' ? held.inst : null;
    if (!tyre && (held || !wheel.sub.tire)) return;
    // the turntable spins while the head works round the bead; then the swap is done
    this.tcLeft = 1.6;
    ctx.sound('ratchet');
    this.tcJob = () => {
      const loose = ctx.loose;
      if (tyre) {
        const old = fitSub(wheel, 'tire', tyre);
        ctx.player.held = old ? { kind: 'part', inst: old } : null;
      } else {
        const off = removeSub(wheel, 'tire');
        if (off) ctx.player.held = { kind: 'part', inst: off };
      }
      // redraw the wheel with (or without) its tyre
      loose.remove(w);
      loose.addPart(wheel, w.x, w.y, w.z, w.yaw).resting = true;
      ctx.sound('ratchet_done');
    };
  }

  // ------------------------------------------------------------------ the sink

  private sinkWord(): Text {
    const held = this.ctx?.player.held;
    if (held?.kind === 'tool' && held.tool.kind === 'bottle') return text('水龙头 · 把水壶灌满', 'Tap · fill the bottle');
    if (held?.kind === 'tool' && held.tool.kind === 'sponge') return text('水龙头 · 把海绵打湿', 'Tap · wet the sponge');
    return text('水龙头 · 洗洗手', 'Tap · wash your hands');
  }

  private sinkUse(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const held = ctx.player.held;
    ctx.sound('pour');
    if (held?.kind === 'tool' && held.tool.kind === 'bottle') {
      held.tool.litres = TOOL_INFO.bottle.capacity;
      ctx.ui.say('水壶灌满了。', 2);
    } else if (held?.kind === 'tool' && held.tool.kind === 'sponge') ctx.ui.say('海绵吸饱了水。', 2);
    else ctx.ui.say('手上的机油洗掉了一半。', 2);
  }

  // ------------------------------------------------------------------ the paint gun

  /** the vehicle the gun's hose reaches (the nearest within 9 m of the compressor) */
  private paintTarget(): { v: GarageContext['vehicles'][number]; d: number } | null {
    const ctx = this.ctx;
    const dv = this.rig.device('paintbooth');
    if (!ctx || !dv) return null;
    let best: { v: GarageContext['vehicles'][number]; d: number } | null = null;
    for (const v of ctx.vehicles) {
      const d = Math.hypot(v.sim.px - dv.x, v.sim.pz - dv.z);
      if (d < 9 && (!best || d < best.d)) best = { v, d };
    }
    return best;
  }

  private paintWord(): Text {
    if (this.paintLeft > 0) return text('喷漆中……', 'Spraying…');
    const held = this.ctx?.player.held;
    const t = this.paintTarget();
    if (!t) return text('喷枪 · 管子够不着车', 'Spray gun · no car in reach');
    const name = t.v.view.frame.name;
    if (held?.kind !== 'tool' || held.tool.kind !== 'spray') return text(`喷枪 · 手里拿一罐漆，给${name.zh}整车喷漆`, `Spray gun · hold a spray can to paint the ${name.en}`);
    const p = PALETTE[held.tool.colour ?? 0];
    return text(`喷枪 · 把${name.zh}整车喷成${p.name.zh}`, `Spray gun · paint the ${name.en} ${p.name.en}`);
  }

  private paintUse(): void {
    const ctx = this.ctx;
    if (!ctx || this.paintLeft > 0) return;
    const held = ctx.player.held;
    const t = this.paintTarget();
    if (!t || held?.kind !== 'tool' || held.tool.kind !== 'spray') return;
    const colour = held.tool.colour ?? 0;
    const v = t.v;
    this.paintLeft = 1.8;
    ctx.sound('spray');
    this.paintJob = () => {
      v.build.paint = colour;
      ctx.changed(v, 'paint:frame');
      ctx.ui.say(`${v.view.frame.name.zh}换上了${PALETTE[colour].name.zh}的新漆。`, 2.5);
    };
  }

  // ------------------------------------------------------------------ every frame

  update(dt: number, ctx: GarageContext): void {
    this.ctx = ctx;
    this.t += dt;
    const mv = this.rig.movers;
    // the lift: up 1.7 m in about four seconds
    if (this.liftT !== this.liftTarget) {
      const step = dt / 4;
      this.liftT = this.liftTarget > this.liftT ? Math.min(this.liftTarget, this.liftT + step) : Math.max(this.liftTarget, this.liftT - step);
    }
    const lift = mv.get('LIFT');
    const liftRest = this.rig.rest.get('LIFT');
    if (lift && liftRest) lift.position.y = liftRest.y + 1.7 * (this.liftT * this.liftT * (3 - 2 * this.liftT));
    // the tyre changer's table spins while a job runs
    if (this.tcLeft > 0) {
      this.tcLeft -= dt;
      this.tcSpin += dt * 5.5;
      if (this.tcLeft <= 0) {
        this.tcLeft = 0;
        const job = this.tcJob;
        this.tcJob = null;
        job?.();
      }
    }
    const table = mv.get('TC_TABLE');
    if (table) table.rotation.y = this.tcSpin;
    // the radio: the dial lights, the pointer drifts to the station
    const want = this.radioOn ? 0.25 + 0.12 * this.song : -0.35;
    this.radioNeedle += (want - this.radioNeedle) * Math.min(1, dt * 2.5);
    const needle = mv.get('RADIO_NEEDLE');
    if (needle) needle.position.z = (this.rig.rest.get('RADIO_NEEDLE')?.z ?? 0) + this.radioNeedle * 0.1;
    const dial = this.radioOn ? 1 : 0;
    this.rig.look.setGlow('dial', 2.2 * dial, 1.4 * dial, 0.55 * dial);
    // the paint gun
    if (this.paintLeft > 0) {
      this.paintLeft -= dt;
      if (this.paintLeft <= 0) {
        this.paintLeft = 0;
        const job = this.paintJob;
        this.paintJob = null;
        job?.();
      }
    }
    // the clock shows the hour of the day; the fan turns
    const h = ctx.hour;
    const hh = mv.get('CLOCK_H');
    const mm = mv.get('CLOCK_M');
    if (hh) hh.rotation.x = -((h % 12) / 12) * Math.PI * 2;
    if (mm) mm.rotation.x = -(h % 1) * Math.PI * 2;
    const fan = mv.get('FAN');
    if (fan) fan.rotation.x += dt * 9;
  }

  telemetry(): Record<string, string | number | boolean> {
    return { lift: Math.round(this.liftT * 100) / 100, radio: this.radioOn, tyreJob: this.tcLeft > 0 };
  }
}
