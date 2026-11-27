/**
 * The controls in the cab (docs/MODCAR.md §5.1): in the driver's seat the mark finds the handbrake, the
 * key, the radio, the horn and the doors; a click works them (the key: hold to crank), exactly like their
 * keys. The parts move: the lever goes up, the key turns, and the gear lever leans with the gear the box is in —
 * the gearbox is an automatic, as Nomad Drive's are (no lever of theirs to work): the lever is the cab's look, never
 * marked, never worked (the player's word of 2026-11-27).
 *
 * From the other front seat (docs/V3/nodes/M1-interact.md) one reaches what lies between the seats and beside
 * one — the handbrake, the radio, the door on one's own side — and from either front seat the mark finds the
 * other one: a click moves one over. Q held gets one out (docs/V3/plan/growth.md J1: E is gone).
 *
 * What the middle of the view is on is what is marked, as Nomad Drive's one ray from the eye does it: each control
 * is met by a shape of its own — the small ones (the handbrake, the key, the radio) by their own box as they stand, a
 * centimetre larger all round; the wheel, a door, the other seat by their own meshes — and the nearest one the ray
 * meets is the one, unless anything else of the vehicle (the dashboard, a pillar, one's own seat) stands in front of
 * it by more than its skin's grace. A seat's big box never stands over the lever beside it, nor the wheel's over the
 * key behind it.
 */
import type { Action } from './hudItems';
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import { nearestMarked } from './aim';
import type { MountDef } from '../../core/modcar/types';
import { SONGS, stationLabel } from './radio';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';

/** what the mark finds from the driver's seat (gear lever is decorative; steering wheel is not horn — H or horn pad is) */
const CONTROL_CATS = new Set(['handbrake', 'ignition', 'radio', 'horn', 'door']);
/** what one reaches from the passenger's seat: the handbrake and the radio between the seats, the door beside one */
const PASSENGER_CATS = new Set(['handbrake', 'radio', 'door']);
/** the small controls, met on their own box (their own frame's, CONTROL_PAD larger) rather than their meshes alone */
const BOXED_CATS = new Set(['handbrake', 'ignition', 'radio']);
/** how much larger than it is all round a small control's box is (m): a key 3 cm wide is aimed at over 5.4 */
export const CONTROL_PAD = 0.012;
/** how far behind the first thing the ray meets a control may be met and still be the one (m: Nomad Drive's 2 cm) */
export const SKIN_GRACE = 0.02;
/** the hands' reach from a seat (m from the eye) */
export const SEAT_REACH = 1.3;

/** which front seat one sits in */
export type FrontSeat = 'driver' | 'pass';

/**
 * The other front seat of a frame: the seat across the cab from the driver's, about level with it (none on a
 * motorcycle, or where nothing stands across from the driver).
 */
export function passengerSeat(v: ModVehicle): MountDef | null {
  if (v.view.frame.balance) return null;
  const mounts = v.view.frame.mounts;
  const d = mounts.find((m) => m.driver);
  if (!d) return null;
  let best: MountDef | null = null;
  let bd = 0.45;
  for (const m of mounts) {
    if (m.cat !== 'seat' || m === d || m.driver) continue;
    // (across the cab: the other side of the middle, about as far out, about as far forward)
    if (Math.sign(m.pos.z) === Math.sign(d.pos.z) || Math.abs(m.pos.z) < 0.15) continue;
    const off = Math.abs(m.pos.x - d.pos.x) + Math.abs(Math.abs(m.pos.z) - Math.abs(d.pos.z));
    if (off < bd) {
      bd = off;
      best = m;
    }
  }
  return best;
}

/** the seat one sits in, as a mount */
export function seatMount(v: ModVehicle, seat: FrontSeat): MountDef | null {
  return seat === 'pass' ? passengerSeat(v) : (v.view.frame.mounts.find((m) => m.driver) ?? null);
}

/** a door one gets out by from a seat: the one beside it (and a motorhome's side door, the cab open to it) */
export function ownDoor(id: string, seat: FrontSeat): boolean {
  return id === 'door_side' || id.endsWith(seat === 'pass' ? 'FR' : 'FL');
}

/**
 * A system's own way with a control in the cab (docs/ND/PLAN.md: the tape deck): asked first while the mark is on a
 * mount it claims — its words in place of the control's own, the buttons and the wheel its own when it takes them.
 */
export interface CockpitUse {
  claims(v: ModVehicle, m: MountDef): boolean;
  /** its words for the control (in place of the control's own) */
  actions(v: ModVehicle, m: MountDef): Action[];
  /** the button went down on it (right: the right button); true: taken */
  press?(v: ModVehicle, m: MountDef, right: boolean): boolean;
  /** the buttons went up */
  release?(v: ModVehicle): void;
  /** the wheel turned over it; true: taken */
  wheel?(v: ModVehicle, m: MountDef, delta: number): boolean;
}

export interface CockpitHost {
  readonly ui: ModUI;
  readonly origin: { x: number; y: number; z: number };
  sound(name: string, gain?: number, mount?: string): void;
  getOut(): void;
  /** which front seat one sits in */
  readonly seatAt: FrontSeat;
  /** looking back from the seat into a living space one may step back into (docs/V3/nodes/M2-rv.md) */
  aftReady(v: ModVehicle): boolean;
  /** the key turned on a vehicle a system's rule keeps from starting (the Turtle's roof up): its why flashed, true */
  blockedStart?(v: ModVehicle): boolean;
}

export class Cockpit {
  aimed: MountDef | null = null;
  /** the mark is on the other front seat (aimed is that seat): E moves one over */
  aimedSeat = false;
  /** looking back into the living space behind the seats, nothing else under the mark: E steps back into it */
  aimedAft = false;
  /** the key held down through a click on it */
  private cranking = false;
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly hits: { t: MountDef; d: number }[] = [];

  constructor(private readonly host: CockpitHost) {}

  /** a mount the hands reach from the seat one sits in: a control there, one's own door, the other front seat */
  private reaches(v: ModVehicle, m: MountDef, seat: FrontSeat, other: MountDef | null): boolean {
    if (!v.build.parts[m.id]) return false;
    if (m === other) return true;
    if (!CONTROL_CATS.has(m.cat) || (seat === 'pass' && !PASSENGER_CATS.has(m.cat))) return false;
    // (only one's own doors from the seat)
    return m.cat !== 'door' || ownDoor(m.id, seat);
  }

  /** what the camera's middle is on, among the cab's controls (the module's comment: Nomad Drive's one ray) */
  pick(v: ModVehicle, cam: THREE.PerspectiveCamera): MountDef | null {
    cam.updateMatrixWorld();
    const eye = cam.getWorldPosition(this.eye);
    const dir = cam.getWorldDirection(this.dir);
    const seat = this.host.seatAt;
    const other = seatMount(v, seat === 'pass' ? 'driver' : 'pass');
    const hits = this.hits;
    hits.length = 0;
    for (const m of v.view.frame.mounts) {
      if (!this.reaches(v, m, seat, other)) continue;
      const d = BOXED_CATS.has(m.cat) ? v.view.boxCast(m.id, eye, dir, CONTROL_PAD, SEAT_REACH) : v.view.castOn(m.id, eye, dir, SEAT_REACH);
      if (d !== null) hits.push({ t: m, d });
    }
    // (what of the vehicle the ray meets first of all: the dashboard, a pillar, one's own seat in front of a control hide it)
    const best = hits.length ? nearestMarked(hits, v.view.castShown(eye, dir, SEAT_REACH)?.dist ?? null, SKIN_GRACE) : null;
    hits.length = 0;
    this.aimedSeat = best !== null && best === other;
    return best;
  }

  /** the systems' own ways with the controls (CockpitUse): the first that claims the one aimed at has it */
  readonly uses: CockpitUse[] = [];

  private useFor(v: ModVehicle, m: MountDef | null): CockpitUse | null {
    if (!m || this.aimedSeat) return null;
    for (const u of this.uses) if (u.claims(v, m)) return u;
    return null;
  }

  /** the wheel over what is aimed at: true when a system's control took it */
  wheel(v: ModVehicle, delta: number): boolean {
    const m = this.aimed;
    return !!(m && this.useFor(v, m)?.wheel?.(v, m, delta));
  }

  update(dt: number, v: ModVehicle, cam: THREE.PerspectiveCamera, cockpit: boolean): void {
    this.aimed = cockpit ? this.pick(v, cam) : null;
    const ui = this.host.ui;
    const m = this.aimed;
    const acts: Action[] = [];
    if (m) {
      const name = partDef(v.build.parts[m.id].part).name[ui.lang];
      const s = v.sim;
      const use = this.useFor(v, m);
      if (this.aimedSeat) acts.push({ keys: ['LMB'], text: this.host.seatAt === 'pass' ? '坐到驾驶座' : '坐到副驾驶' });
      else if (use) acts.push(...use.actions(v, m));
      else if (m.cat === 'handbrake') acts.push({ keys: ['LMB'], text: `${s.parkBrake > 0 ? '松开' : '拉起'} <b>${name}</b>` });
      else if (m.cat === 'ignition') acts.push(v.sys.running ? { keys: ['LMB'], text: `熄火 <b>${name}</b>` } : { keys: ['LMB'], hold: true, text: `打火 <b>${name}</b>` });
      else if (m.cat === 'radio') acts.push(...(v.radioOn ? [{ keys: ['LMB'], text: `关掉 <b>${name}</b>` }, { keys: ['RMB'], text: '换台' }] as Action[] : [{ keys: ['LMB'], text: `打开 <b>${name}</b>` }] as Action[]));
      else if (m.cat === 'horn' || m.cat === 'steering') acts.push({ keys: ['LMB'], hold: true, text: '按喇叭' });
      else if (m.cat === 'door') acts.push({ keys: ['LMB'], text: v.view.panelOpen(m.id) > 0.5 ? '关门' : '开门' }, { keys: ['Q'], hold: true, text: '下车' });
      ui.prompt(true, '', -1);
    } else ui.prompt(cockpit, '', -1);
    this.aimedAft = cockpit && !m && this.host.aftReady(v);
    if (this.aimedAft) acts.push({ keys: ['LMB'], text: '到车厢里' });
    ui.items.showActions(acts);
    // the parts that move
    this.pose(v, dt);
    if (this.cranking && !v.sys.cranking && !v.sys.running) this.cranking = false;
  }

  /** a click (or the button down) on what is aimed at; right = true for the right button */
  press(v: ModVehicle, right: boolean): boolean {
    const m = this.aimed;
    if (!m) return false;
    if (this.useFor(v, m)?.press?.(v, m, right)) return true;
    const s = v.sim;
    if (m.cat === 'handbrake') {
      s.setParkBrake(s.parkBrake <= 0);
      this.host.sound('ratchet');
    } else if (m.cat === 'ignition') {
      if (v.sys.running) v.sys.stop('');
      else if (!this.host.blockedStart?.(v)) {
        v.sys.crank(true);
        this.cranking = true;
      }
      this.host.sound('key');
    } else if (m.cat === 'radio') {
      // left: on / off; right while on: the next station
      if (right && v.radioOn) v.radioSong = (v.radioSong + 1) % SONGS.length;
      else v.radioOn = !v.radioOn;
      this.host.sound('switch');
      if (v.radioOn) this.host.ui.say(v.sys.dash.battery > 0.02 ? `收音机：「${stationLabel(v.radioSong)}」` : '收音机没反应：电瓶没电。', 2.5);
    }
    else if (m.cat === 'horn' || m.cat === 'steering') v.sys.setHorn(true);
    else if (m.cat === 'door') {
      const open = v.view.panelOpen(m.id) < 0.5;
      v.view.setPanelOpen(m.id, open);
      this.host.sound(open ? 'door_open' : 'door_close', 1, m.id);
    }
    return true;
  }

  release(v: ModVehicle): void {
    for (const u of this.uses) u.release?.(v);
    if (this.cranking) {
      v.sys.crank(false);
      this.cranking = false;
    }
    v.sys.setHorn(false);
  }

  private readonly lever = new Map<string, number>();
  /**
   * What moves on the controls (the parts' movers, docs/MODCAR.md §6): the handbrake's LEVER comes up
   * (a drift lever goes back), the gear lever's LEVER leans with the gear, the KEY turns, a start
   * button's guard flips up and the BUTTON goes in, the radio's volume knob turns. A stand-in part with
   * no movers turns as a whole.
   */
  private pose(v: ModVehicle, dt: number): void {
    const ease = (key: string, target: number): number => {
      const now = this.lever.get(key) ?? target;
      const next = now + (target - now) * Math.min(1, dt * 14);
      this.lever.set(key, next);
      return next;
    };
    const part = (cat: string): { node: THREE.Object3D; id: string } | null => {
      const m = v.view.frame.mounts.find((x) => x.cat === cat && v.build.parts[x.id]);
      const node = m ? v.view.nodeOf(m.id) : null;
      return m && node ? { node, id: v.build.parts[m.id].part } : null;
    };
    const s = v.sim;
    const hb = part('handbrake');
    if (hb) {
      // game z: hb_stock is pulled −25° (its rear end up), hb_drift +25° (its top back towards the driver)
      const pull = hb.id === 'hb_drift' ? 0.44 : -0.44;
      const a = ease('hb', s.parkBrake > 0 || s.handbrake > 0.5 ? pull : 0);
      const lever = hb.node.getObjectByName('LEVER');
      if (lever) lever.rotation.z = a;
      else hb.node.rotation.z = -a;
    }
    const gl = part('gearLever');
    if (gl) {
      const sel = s.selector;
      const g = sel === 'P' ? -0.32 : sel === 'R' ? -0.18 : sel === 'N' ? 0 : 0.14 + 0.06 * Math.min(4, s.gear - 1);
      const a = ease('gl', g);
      (gl.node.getObjectByName('LEVER') ?? gl.node).rotation.z = a;
    }
    const ig = part('ignition');
    if (ig) {
      const on = v.sys.cranking || v.sys.running;
      const key = ig.node.getObjectByName('KEY');
      const a = ease('ig', v.sys.cranking ? 1.2 : v.sys.running ? 0.8 : 0);
      if (key) key.rotation.x = a;
      const btn = ig.node.getObjectByName('BUTTON');
      if (btn) btn.position.x = ease('igb', v.sys.cranking ? 0.004 : 0) + (btn.userData.restX ??= btn.position.x);
      const cover = ig.node.getObjectByName('COVER');
      if (cover) cover.rotation.z = ease('igc', on ? -1.6 : 0);
      if (!key && !btn) ig.node.rotation.x = a;
    }
    const radio = part('radio');
    if (radio) {
      const knob = radio.node.getObjectByName('KNOB_L');
      if (knob) knob.rotation.x = ease('vol', v.radioOn ? 1.4 : 0);
      // the tuning knob goes round to the station
      const tune = radio.node.getObjectByName('KNOB_R');
      if (tune) tune.rotation.x = ease('tune', v.radioOn ? 0.5 + 0.9 * (v.radioSong % SONGS.length) : 0);
    }
  }
}
