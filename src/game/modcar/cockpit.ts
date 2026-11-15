/**
 * The controls in the cab (docs/MODCAR.md §5.1): in the driver's seat the mark finds the handbrake, the
 * gear lever, the key, the radio, the horn and the doors; a click works them (the key: hold to crank),
 * exactly like their keys. The parts move: the lever goes up, the gear lever leans, the key turns.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import type { MountDef } from '../../core/modcar/types';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';

const CONTROL_CATS = new Set(['handbrake', 'gearLever', 'ignition', 'radio', 'horn', 'door', 'steering']);

export interface CockpitHost {
  readonly ui: ModUI;
  readonly origin: { x: number; y: number; z: number };
  sound(name: string): void;
  getOut(): void;
}

export class Cockpit {
  aimed: MountDef | null = null;
  /** the key held down through a click on it */
  private cranking = false;
  radioOn = false;
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
    for (const m of v.view.frame.mounts) {
      if (!CONTROL_CATS.has(m.cat) || !v.build.parts[m.id]) continue;
      // only the driver's own doors from the seat
      if (m.cat === 'door' && !(m.id.endsWith('FL') || m.id === 'door_side')) continue;
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
    return best;
  }

  update(dt: number, v: ModVehicle, cam: THREE.PerspectiveCamera, cockpit: boolean): void {
    this.aimed = cockpit ? this.pick(v, cam) : null;
    const ui = this.host.ui;
    const m = this.aimed;
    if (m) {
      const name = partDef(v.build.parts[m.id].part).name[ui.lang];
      const s = v.sim;
      let word = '';
      if (m.cat === 'handbrake') word = s.parkBrake > 0 ? `松手刹 <b>${name}</b>` : `拉手刹 <b>${name}</b>`;
      else if (m.cat === 'gearLever') word = `挡位 <b>${v.sys.dash.gearLabel}</b><small>左键加挡 · 右键减挡</small>`;
      else if (m.cat === 'ignition') word = v.sys.running ? `熄火 <b>${name}</b>` : `打火 <b>${name}</b><small>按住</small>`;
      else if (m.cat === 'radio') word = `${this.radioOn ? '关' : '开'} <b>${name}</b>`;
      else if (m.cat === 'horn' || m.cat === 'steering') word = `喇叭<small>按住</small>`;
      else if (m.cat === 'door') word = `${v.view.panelOpen(m.id) > 0.5 ? '关门' : '开门'}<small>E 下车</small>`;
      ui.prompt(true, word, -1);
    } else ui.prompt(cockpit, '', -1);
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
    } else if (m.cat === 'radio') this.radioOn = !this.radioOn;
    else if (m.cat === 'horn' || m.cat === 'steering') v.sys.setHorn(true);
    else if (m.cat === 'door') {
      const open = v.view.panelOpen(m.id) < 0.5;
      v.view.setPanelOpen(m.id, open);
      this.host.sound(open ? 'door_open' : 'door_close');
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
      if (knob) knob.rotation.x = ease('vol', this.radioOn ? 1.4 : 0);
    }
  }
}
