/**
 * The workshop's machines at work (docs/MODCAR.md §9): the lift goes up and down (with a car standing
 * between its posts it takes it up by the sills, the wheels left hanging), the tyre changer
 * puts a tyre on a wheel lying on its turntable (or takes it off), the radio plays (its dial lights, the
 * pointer finds the station; the game plays the song, radio.ts), the sink fills the water bottle, the paint gun on
 * its long hose hooks to the can in hand and gives it a wide nozzle (docs/V3/plan/growth.md §1.5, J3: sprayed where
 * it is aimed like any can, a coat of the can's colour as far as the disc goes; the hose reaches 9 m, the can taken
 * further — or put away — comes off it), the clock keeps the day's time, the fan turns.
 *
 * Each is a GarageDevice (aim point, word, use) plus a little state stepped every frame.
 */
import type * as THREE from 'three';
import { fitSub, removeSub } from '../../core/modcar/build';
import { DEFAULT_NOZZLE, GUN_NOZZLE, sprayLeft } from '../../core/modcar/paint';
import { partDef } from '../../core/modcar/parts';
import { TOOL_INFO } from '../../core/modcar/tools';
import type { Text } from '../../core/modcar/types';
import type { GarageContext, GarageDevice } from './garageStub';
import type { GarageLook } from './garageLook';
import type { Loose } from './loose';
import { SONGS as RADIO_SONGS, stationLabel } from './radio';
import type { ModVehicle } from './vehicle';

const text = (zh: string, en: string): Text => ({ zh, en });

/** what the machines need of the garage */
export interface MachineRig {
  movers: Map<string, THREE.Object3D>;
  rest: Map<string, THREE.Vector3>;
  look: GarageLook;
  device(id: string): { x: number; y: number; z: number; radius: number } | null;
  surface(name: string): { x0: number; x1: number; z0: number; z1: number; y: number } | null;
  /** where a car stands between the lift's posts (nose along x) */
  liftBay: { x: number; z: number } | null;
  /** the garage has power (the generator outside runs): the paint gun's compressor needs it */
  power?: () => boolean;
}

/** how high the lift's arms go (m), and how far they rise before their pads are under a car's sills */
const LIFT_TRAVEL = 1.7;
const LIFT_ENGAGE = 0.06;

/** how far the paint gun's hose reaches from its booth (m): the can taken further comes off it */
const HOSE_M = 9;

/** the stations' songs (radio.ts: made up, synthesized) by their names */
/** the set's stations (as many as the radio has), and what one is called, with what is on it now */
const SONGS = RADIO_SONGS;
const songLabel = (i: number): string => `「${stationLabel(i)}」`;

export class Machines {
  readonly devices: GarageDevice[] = [];
  private ctx: GarageContext | null = null;
  private t = 0;
  // the lift, and the car on it (held where it stood, raised by the arms)
  private liftT = 0;
  private liftTarget = 0;
  private liftCar: { v: ModVehicle; x: number; y: number; z: number; q: [number, number, number, number] } | null = null;
  // the tyre changer: a job under way (seconds left) and what to do at its end
  private tcLeft = 0;
  private tcJob: (() => void) | null = null;
  private tcSpin = 0;
  // the radio
  radioOn = false;
  private radioNeedle = 0;
  private song = 0;

  constructor(private readonly rig: MachineRig) {
    const self = this;
    const add = (id: string, word: () => Text, use: () => void, why?: () => Text | null): void => {
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
        get why(): Text | null {
          return why ? why() : null;
        },
        use,
      });
    };
    add(
      'lift',
      () => {
        return self.liftTarget > 0.5 ? text('降下', 'Lower') : text('升起', 'Raise');
      },
      () => {
        this.liftTarget = this.liftTarget > 0.5 ? 0 : 1;
        if (this.liftTarget > 0.5 && !this.liftCar) {
          const v = this.carInBay();
          if (v) {
            const s = v.sim;
            this.liftCar = { v, x: s.px, y: s.py, z: s.pz, q: [s.qx, s.qy, s.qz, s.qw] };
          }
        }
        this.ctx?.sound('lever');
      },
      // (raised with nothing between its posts: why, pressed)
      () => (self.liftTarget <= 0.5 && !self.liftCar && !self.carInBay() ? text('先把车停到立柱中间', 'Park a car between the posts') : null),
    );
    add('tyrechanger', () => this.tyreWord(), () => this.tyreUse(), () => this.tyreWhy());
    add(
      'radio',
      () => (self.radioOn ? text('关收音机', 'Turn the radio off') : text('开收音机', 'Turn the radio on')),
      () => {
        this.radioOn = !this.radioOn;
        if (this.radioOn) this.song = (this.song + 1) % SONGS.length;
        this.ctx?.sound('switch');
        if (this.radioOn) this.ctx?.ui.say(songLabel(this.song), 2.4);
      },
    );
    add('sink', () => this.sinkWord(), () => this.sinkUse());
    add('paintbooth', () => this.paintWord(), () => this.paintUse(), () => this.paintWhy());
  }

  // ------------------------------------------------------------------ the lift

  private readonly basis = new Float64Array(9);

  /** a car standing still between the posts, nose along the bay (the arms reach its sills) */
  private carInBay(): ModVehicle | null {
    const bay = this.rig.liftBay;
    const ctx = this.ctx;
    if (!bay || !ctx) return null;
    for (const v of ctx.vehicles) {
      const s = v.sim;
      if (Math.abs(s.px - bay.x) > 1.1 || Math.abs(s.pz - bay.z) > 0.55) continue;
      if (Math.hypot(s.vx, s.vz) > 0.3) continue;
      s.basis(this.basis);
      if (Math.abs(this.basis[0]) < 0.9) continue;
      return v;
    }
    return null;
  }

  /** the car on the lift stays where the arms hold it: up with them, its wheels hanging free */
  private holdCar(rise: number): void {
    const c = this.liftCar;
    if (!c) return;
    const s = c.v.sim;
    s.px = s.ppx = c.x;
    s.pz = s.ppz = c.z;
    s.py = s.ppy = c.y + rise;
    s.qx = s.pqx = c.q[0];
    s.qy = s.pqy = c.q[1];
    s.qz = s.pqz = c.q[2];
    s.qw = s.pqw = c.q[3];
    s.vx = s.vy = s.vz = 0;
    s.avx = s.avy = s.avz = 0;
    // (kept awake: its physics goes on stepping, so the wheels drop on their springs)
    if (rise > 0) c.v.awake = Math.max(c.v.awake, 0.5);
    // down again: it stands on its wheels
    if (this.liftT === 0 && this.liftTarget === 0) this.liftCar = null;
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
    if (this.tcLeft > 0) return text('换胎中', 'Turning');
    const w = this.wheelOnTable();
    const held = this.ctx?.player.held;
    if (!w?.part) return text('换胎', 'Change a tyre');
    const rim = partDef(w.part.part);
    if (!rim.rim?.tire) return text('换胎', 'Change a tyre');
    const tyre = held?.kind === 'part' && partDef(held.inst.part).cat === 'tire' ? held.inst : null;
    if (tyre) return w.part.sub.tire ? text(`换上 <b>${partDef(tyre.part).name.zh}</b>`, `Swap in the ${partDef(tyre.part).name.en}`) : text(`装上 <b>${partDef(tyre.part).name.zh}</b>`, `Fit the ${partDef(tyre.part).name.en}`);
    if (held) return text('换胎', 'Change a tyre');
    if (w.part.sub.tire) return text(`拆下 <b>${partDef(w.part.sub.tire.part).name.zh}</b>`, `Take the ${partDef(w.part.sub.tire.part).name.en} off`);
    return text('换胎', 'Change a tyre');
  }

  /** why the tyre changer does nothing pressed now (null: it does something) */
  private tyreWhy(): Text | null {
    if (this.tcLeft > 0) return text('正在换', 'Turning');
    const w = this.wheelOnTable();
    const held = this.ctx?.player.held;
    if (!w?.part) return text('先放车轮上去', 'Put a wheel on it');
    if (!partDef(w.part.part).rim?.tire) return text('这个装不了胎', 'Takes no tyre');
    const tyre = held?.kind === 'part' && partDef(held.inst.part).cat === 'tire' ? held.inst : null;
    if (tyre) return null;
    if (held) return text('先空手', 'Hands full');
    if (w.part.sub.tire) return null;
    return text('拿个轮胎来', 'Bring a tyre');
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
    this.tcLeft = 1;
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
    if (held?.kind === 'tool' && held.tool.kind === 'bottle') return text('灌满水壶', 'Fill the bottle');
    return text('洗手', 'Wash your hands');
  }

  private sinkUse(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const held = ctx.player.held;
    ctx.sound('pour');
    if (held?.kind === 'tool' && held.tool.kind === 'bottle') {
      held.tool.litres = TOOL_INFO.bottle.capacity;
      ctx.player.flashWhy('灌满了');
    } else if (held?.kind === 'tool' && held.tool.kind === 'sponge') ctx.ui.say('海绵吸饱了水。', 2);
    else ctx.ui.say('手上的机油洗掉了一半。', 2);
  }

  // ------------------------------------------------------------------ the paint gun

  private paintWord(): Text {
    const held = this.ctx?.player.held;
    if (held?.kind === 'tool' && held.tool.kind === 'spray') {
      if ((held.tool.nozzle ?? DEFAULT_NOZZLE) === GUN_NOZZLE) return text('取下喷枪', 'Unhook the gun');
    }
    return text('接上喷枪', 'Hook up the gun');
  }

  /** why the paint gun does nothing pressed now (null: it does something) */
  private paintWhy(): Text | null {
    const held = this.ctx?.player.held;
    if (held?.kind !== 'tool' || held.tool.kind !== 'spray') return text('拿着喷漆罐', 'Hold a spray can');
    if ((held.tool.nozzle ?? DEFAULT_NOZZLE) === GUN_NOZZLE) return null;
    if (!this.powered) return text('没电', 'No power');
    return sprayLeft(held.tool) > 0 ? null : text('罐子空了', 'The can is empty');
  }

  /** the gun hooked to the can in the hands (a wide nozzle, as far as the hose reaches), or unhooked */
  private paintUse(): void {
    const ctx = this.ctx;
    const held = ctx?.player.held;
    if (!ctx || held?.kind !== 'tool' || held.tool.kind !== 'spray') return;
    const on = (held.tool.nozzle ?? DEFAULT_NOZZLE) !== GUN_NOZZLE;
    if (on && sprayLeft(held.tool) <= 0) return;
    if (on && !this.powered) {
      ctx.player.flashWhy('没电');
      return;
    }
    held.tool.nozzle = on ? GUN_NOZZLE : DEFAULT_NOZZLE;
    ctx.sound(on ? 'latch' : 'switch');
    ctx.player.flashWhy(on ? '喷枪接上了' : '喷枪取下了');
  }

  /** the garage has power for the compressor (a garage that does not say: it has) */
  private get powered(): boolean {
    return this.rig.power ? this.rig.power() : true;
  }

  /** the gun's hose: a can hooked to it taken beyond its reach (or put down) comes off it; the power gone, it stops */
  private stepHose(ctx: GarageContext): void {
    const p = ctx.player;
    const held = p.held;
    for (const h of p.slots) {
      if (h?.kind !== 'tool' || h.tool.kind !== 'spray' || (h.tool.nozzle ?? DEFAULT_NOZZLE) !== GUN_NOZZLE) continue;
      const at = this.rig.device('paintbooth');
      const far = !at || Math.hypot(p.walker.x - at.x, p.walker.z - at.z) > HOSE_M;
      if (!far && h === held && this.powered) continue;
      h.tool.nozzle = DEFAULT_NOZZLE;
      if (h === held) ctx.player.flashWhy(far ? '管子够不着了' : '没电了');
    }
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
    const liftY = LIFT_TRAVEL * (this.liftT * this.liftT * (3 - 2 * this.liftT));
    const lift = mv.get('LIFT');
    const liftRest = this.rig.rest.get('LIFT');
    if (lift && liftRest) lift.position.y = liftRest.y + liftY;
    this.holdCar(Math.max(0, liftY - LIFT_ENGAGE));
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
    // the paint gun: its hose reaches so far; the can taken further, it comes off
    this.stepHose(ctx);
    // the clock shows the hour of the day; the fan turns
    const h = ctx.hour;
    const hh = mv.get('CLOCK_H');
    const mm = mv.get('CLOCK_M');
    if (hh) hh.rotation.x = -((h % 12) / 12) * Math.PI * 2;
    if (mm) mm.rotation.x = -(h % 1) * Math.PI * 2;
    const fan = mv.get('FAN');
    if (fan) fan.rotation.x += dt * 9;
  }

  /** the set on the tool chest: on or off, its station, where it stands */
  radio(): { on: boolean; song: number; x: number; y: number; z: number } | null {
    const d = this.rig.device('radio');
    return d ? { on: this.radioOn, song: this.song, x: d.x, y: d.y, z: d.z } : null;
  }

  telemetry(): Record<string, string | number | boolean> {
    return { lift: Math.round(this.liftT * 100) / 100, liftCar: this.liftCar ? this.liftCar.v.view.frame.name.en : '', radio: this.radioOn, tyreJob: this.tcLeft > 0 };
  }
}
