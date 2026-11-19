/**
 * The controls in the cab (docs/MODCAR.md §5.1): in the driver's seat the mark finds the handbrake, the
 * gear lever, the key, the radio, the horn and the doors; a click works them (the key: hold to crank),
 * exactly like their keys. The parts move: the lever goes up, the gear lever leans, the key turns.
 *
 * From the other front seat (docs/V3/nodes/M1-interact.md) one reaches what lies between the seats and beside
 * one — the handbrake, the radio, the door on one's own side — and from either front seat the mark finds the
 * other one: E moves one over. Getting out is offered on the door beside one's seat, not all the time.
 */
import type { Action } from './hudItems';
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import type { MountDef } from '../../core/modcar/types';
import { SONGS } from './radio';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';

const CONTROL_CATS = new Set(['handbrake', 'gearLever', 'ignition', 'radio', 'horn', 'door', 'steering']);
/** what one reaches from the passenger's seat: the handbrake and the radio between the seats, the door beside one */
const PASSENGER_CATS = new Set(['handbrake', 'radio', 'door']);

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

export interface CockpitHost {
  readonly ui: ModUI;
  readonly origin: { x: number; y: number; z: number };
  sound(name: string, gain?: number, mount?: string): void;
  getOut(): void;
  /** which front seat one sits in */
  readonly seatAt: FrontSeat;
  /** looking back from the seat into a living space one may step back into (docs/V3/nodes/M2-rv.md) */
  aftReady(v: ModVehicle): boolean;
}

export class Cockpit {
  aimed: MountDef | null = null;
  /** the mark is on the other front seat (aimed is that seat): E moves one over */
  aimedSeat = false;
  /** looking back into the living space behind the seats, nothing else under the mark: E steps back into it */
  aimedAft = false;
  /** the key held down through a click on it */
  private cranking = false;
  private readonly box = new THREE.Box3();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly v = new THREE.Vector3();

  constructor(private readonly host: CockpitHost) {}

  /** what the camera's middle is on, among the cab's controls */
  pick(v: ModVehicle, cam: THREE.PerspectiveCamera): MountDef | null {
    cam.updateMatrixWorld();
    cam.getWorldPosition(this.v);
    this.ray.origin.copy(this.v);
    cam.getWorldDirection(this.ray.direction);
    let best: MountDef | null = null;
    let bd = 1.3;
    const seat = this.host.seatAt;
    const other = seatMount(v, seat === 'pass' ? 'driver' : 'pass');
    this.aimedSeat = false;
    for (const m of v.view.frame.mounts) {
      const across = m === other;
      if (!v.build.parts[m.id] || (!across && (!CONTROL_CATS.has(m.cat) || (seat === 'pass' && !PASSENGER_CATS.has(m.cat))))) continue;
      // only one's own doors from the seat
      if (m.cat === 'door' && !ownDoor(m.id, seat)) continue;
      const b = v.view.boundsOf(m.id, this.box);
      if (!b) continue;
      b.expandByScalar(0.02);
      const p = this.ray.intersectBox(b, this.hit);
      if (!p) continue;
      const d = p.distanceTo(this.ray.origin);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    this.aimedSeat = best !== null && best === other;
    return best;
  }

  update(dt: number, v: ModVehicle, cam: THREE.PerspectiveCamera, cockpit: boolean): void {
    this.aimed = cockpit ? this.pick(v, cam) : null;
    const ui = this.host.ui;
    const m = this.aimed;
    const acts: Action[] = [];
    if (m) {
      const name = partDef(v.build.parts[m.id].part).name[ui.lang];
      const s = v.sim;
      if (this.aimedSeat) acts.push({ keys: ['E'], text: this.host.seatAt === 'pass' ? '坐到驾驶座' : '坐到副驾驶' });
      else if (m.cat === 'handbrake') acts.push({ keys: ['LMB'], text: `${s.parkBrake > 0 ? '松开' : '拉起'} <b>${name}</b>` });
      else if (m.cat === 'gearLever') acts.push({ keys: ['LMB'], text: `加挡 · 现在 <b>${v.sys.dash.gearLabel}</b>` }, { keys: ['RMB'], text: '减挡' });
      else if (m.cat === 'ignition') acts.push(v.sys.running ? { keys: ['LMB'], text: `熄火 <b>${name}</b>` } : { keys: ['LMB'], hold: true, text: `打火 <b>${name}</b>` });
      else if (m.cat === 'radio') acts.push(...(v.radioOn ? [{ keys: ['LMB'], text: `关掉 <b>${name}</b>` }, { keys: ['RMB'], text: `换台 · 「${SONGS[v.radioSong % SONGS.length].name}」` }] as Action[] : [{ keys: ['LMB'], text: `打开 <b>${name}</b>` }] as Action[]));
      else if (m.cat === 'horn' || m.cat === 'steering') acts.push({ keys: ['LMB'], hold: true, text: '按喇叭' });
      else if (m.cat === 'door') acts.push({ keys: ['LMB'], text: v.view.panelOpen(m.id) > 0.5 ? '关门' : '开门' }, { keys: ['E'], text: '下车' });
      ui.prompt(true, '', -1);
    } else ui.prompt(cockpit, '', -1);
    this.aimedAft = cockpit && !m && this.host.aftReady(v);
    if (this.aimedAft) acts.push({ keys: ['E'], text: '到车厢里' });
    ui.items.showActions(acts);
    // the parts that move
    this.pose(v, dt);
    if (this.cranking && !v.sys.cranking && !v.sys.running) this.cranking = false;
  }

  /** a click (or the button down) on what is aimed at; right = true for the right button */
  press(v: ModVehicle, right: boolean): boolean {
    const m = this.aimed;
    if (!m) return false;
    const s = v.sim;
    if (m.cat === 'handbrake') {
      s.setParkBrake(s.parkBrake <= 0);
      this.host.sound('ratchet');
    } else if (m.cat === 'gearLever') this.host.sound(v.sys.stepLever(right ? 1 : -1) ? 'lever' : 'grind');
    else if (m.cat === 'ignition') {
      if (v.sys.running) v.sys.stop('');
      else {
        v.sys.crank(true);
        this.cranking = true;
      }
      this.host.sound('key');
    } else if (m.cat === 'radio') {
      // left: on / off; right while on: the next station
      if (right && v.radioOn) v.radioSong = (v.radioSong + 1) % SONGS.length;
      else v.radioOn = !v.radioOn;
      this.host.sound('switch');
      if (v.radioOn) this.host.ui.say(v.sys.dash.battery > 0.02 ? `收音机：「${SONGS[v.radioSong % SONGS.length].name}」` : '收音机没反应：电瓶没电。', 2.5);
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
