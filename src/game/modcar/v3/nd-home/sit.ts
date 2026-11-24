/**
 * Sitting on the ND furniture (docs/ND/PLAN.md; Nomad Drive's sittable surface and its Player): a chair has one seat,
 * a sofa two, each a device of its own over its cushion — E sits one down there, and the furniture itself is picked
 * up off its back, its arms or its legs. Sat down, one is put on the seat at once, the eye coming down to a sitting
 * one's height within a tenth of a second (Nomad Drive's 0.12 s) and the view turning over 0.45 s to face the way
 * the seat does; it then turns 125° either way of that and no further. Q held 0.35 s stands one up again in front of
 * the seat — not while the vehicle the seat is in goes faster than 15 km/h. Something in the hands stays there and is
 * used as ever (a piece of furniture in them: one cannot sit); nothing is put down meanwhile. A seat riding in a
 * vehicle carries one with it. Sitting gives nothing (Nomad Drive's energy for it is never spent).
 */
import * as THREE from 'three';
import type { GameContext } from '../../kernel/context';
import type { Action } from '../../hudItems';
import type { Loose } from '../../loose';
import { blenderBox, type PartBox } from '../../nd/kit';
import { ND_CHAIR, ND_CHAIR_FOLD, ND_DINNER_CHAIR, ND_SOFA, ND_SOFA_2, ND_STOOL, ND_WC } from '../../../../core/v3/nd/items';

/** a seat of a piece: where the hips go (its model's frame: +x its front, y up), the box over its cushion one aims at */
export interface SeatDef {
  readonly hip: readonly [number, number, number];
  readonly box: PartBox;
}

/** the seats of each kind (the models: tools/blender/items/nd_home.py — the chair's rush seat, the sofa's two cushions) */
export const SEATS: Readonly<Record<string, readonly SeatDef[]>> = {
  [ND_CHAIR]: [{ hip: [-0.03, 0.462, 0], box: blenderBox(0.005, 0, 0.47, 0.36, 0.4, 0.1) }],
  [ND_SOFA]: [1, -1].map((s) => ({ hip: [-0.06, 0.445, -s * 0.33] as const, box: blenderBox(0.03, s * 0.33, 0.4, 0.6, 0.62, 0.12) })),
  // (ND5's: tools/blender/items/nd_home2.py — a camp chair's canvas, a kitchen chair's round seat, a stool's, the
  // second sofa's two cushions, a toilet's shut lid)
  [ND_CHAIR_FOLD]: [{ hip: [-0.03, 0.44, 0], box: blenderBox(0.0, 0, 0.44, 0.5, 0.5, 0.1) }],
  [ND_DINNER_CHAIR]: [{ hip: [0.0, 0.46, 0], box: blenderBox(0.0, 0, 0.45, 0.36, 0.36, 0.08) }],
  [ND_STOOL]: [{ hip: [0.0, 0.585, 0], box: blenderBox(0.0, 0, 0.58, 0.28, 0.28, 0.06) }],
  [ND_SOFA_2]: [1, -1].map((s) => ({ hip: [-0.05, 0.4, -s * 0.31] as const, box: blenderBox(0.04, s * 0.31, 0.37, 0.6, 0.6, 0.12) })),
  [ND_WC]: [{ hip: [0.02, 0.425, 0], box: blenderBox(0.06, 0, 0.41, 0.4, 0.36, 0.06) }],
};

export const SIT = {
  /** the view turns to face the seat's way over this (s) */
  turnS: 0.45,
  /** and then turns this far either way of it (°) */
  yawDeg: 125,
  /** Q held this long stands one up (s) */
  standS: 0.35,
  /** a seat in a vehicle going faster than this is not got up from (km/h) */
  maxKmh: 15,
  /** the eye over the hips, and a little ahead of them (m) */
  eyeUp: 0.75,
  eyeAhead: 0.05,
  /** where one stands up: this far in front of the hips (m) */
  standOut: 0.55,
} as const;

const T = (zh: string, en: string): { zh: string; en: string } => ({ zh, en });
export const SIT_WORD = T('坐下', 'Sit down');

/** where a seat is in the world now: the eye's point (render space), the floor under the piece, the way it faces (a heading on the plan) */
interface SeatPose {
  eye: THREE.Vector3;
  floor: number;
  heading: number;
}

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class Sitting {
  /** the piece and the seat of it one sits on; null: up and about */
  on: { l: Loose; i: number } | null = null;
  /** since one sat down (s), the view's turn then, Q held for (s) */
  private t = 0;
  private yaw0 = 0;
  private qT = 0;
  private qDown = false;
  private refused = 0;
  private readonly pose: SeatPose = { eye: new THREE.Vector3(), floor: 0, heading: 0 };
  private readonly v = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly words: Action[] = [{ keys: ['Q'], hold: true, text: '起身' }];
  private readonly pin = { x: 0, y: 0, z: 0, eye: 1.2, words: this.words as readonly Action[], ring: 0 };
  private off: (() => void) | null = null;

  constructor(private readonly ctx: GameContext) {
    if (typeof window === 'undefined') return;
    const down = (e: KeyboardEvent): void => {
      if (e.code === 'KeyQ' && !e.repeat) this.qDown = true;
    };
    const up = (e: KeyboardEvent): void => {
      if (e.code === 'KeyQ') this.qDown = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.off = () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }

  dispose(): void {
    this.off?.();
    this.off = null;
    if (this.on) this.ctx.player.pin = null;
  }

  /** a seat of a piece, where it is now (null: its model's frame is not to be had) */
  seatPose(l: Loose, i: number, out: SeatPose = this.pose): SeatPose | null {
    const s = SEATS[l.item?.item ?? '']?.[i];
    if (!s) return null;
    const m = l.obj.matrixWorld;
    l.obj.updateMatrixWorld(true);
    out.eye.set(s.hip[0] + SIT.eyeAhead, s.hip[1] + SIT.eyeUp, s.hip[2]).applyMatrix4(m);
    // (its front, +x, on the plan)
    this.x.set(1, 0, 0).transformDirection(m);
    out.heading = Math.atan2(this.x.z, this.x.x);
    out.floor = this.v.set(0, 0, 0).applyMatrix4(m).y;
    return out;
  }

  /** the speed of the vehicle a piece rides in (km/h; 0: it lies about) */
  private kmhOf(l: Loose): number {
    const on = l.riding?.on as { sim?: { kmh: number } } | undefined;
    return on?.sim ? Math.abs(on.sim.kmh) : 0;
  }

  /** sit down on a piece's seat (or move over to it from the one sat on) */
  sit(l: Loose, i: number): void {
    const ctx = this.ctx;
    if (!this.seatPose(l, i)) return;
    this.on = { l, i };
    this.t = 0;
    this.yaw0 = ctx.input.lookYaw;
    this.qT = 0;
    ctx.sound('cloth', 0.5);
  }

  /** up again, in front of the seat (false: not now — the vehicle goes too fast) */
  stand(force = false): boolean {
    const ctx = this.ctx;
    const on = this.on;
    if (!on) return true;
    if (!force && this.kmhOf(on.l) > SIT.maxKmh) return false;
    this.on = null;
    ctx.player.pin = null;
    const p = this.seatPose(on.l, on.i);
    const w = ctx.player.walker;
    if (p) {
      const o = ctx.core.origin;
      const x = p.eye.x + o.x + Math.cos(p.heading) * SIT.standOut;
      const z = p.eye.z + o.z + Math.sin(p.heading) * SIT.standOut;
      const ab = ctx.player.aboard;
      if (ab) {
        // (inside a vehicle's living space: the walk in its frame takes up in front of the seat)
        const m = ab.v.view.model;
        m.updateMatrixWorld(true);
        const q = this.v.set(x - o.x, p.floor, z - o.z);
        m.worldToLocal(q);
        ab.w.place(q.x, q.z, ab.w.yaw);
      } else w.place(x, z, w.heading, 1.5);
    }
    ctx.sound('cloth', 0.35);
    return true;
  }

  /** before the walk: the feet held under the seat, the view kept to it, Q held to get up */
  preStep(dt: number): void {
    const ctx = this.ctx;
    const on = this.on;
    if (!on) return;
    // (the piece gone from where it lay — picked up, taken away: one is up)
    if (!ctx.loose.list.includes(on.l) || !this.seatPose(on.l, on.i)) {
      this.on = null;
      ctx.player.pin = null;
      return;
    }
    const p = this.pose;
    const o = ctx.core.origin;
    this.t += dt;
    // the view: turned to face the seat's way at first, then kept within its reach either way
    const inp = ctx.input;
    const seatYaw = p.heading;
    if (this.t < SIT.turnS) {
      const k = this.t / SIT.turnS;
      const e = k * k * (3 - 2 * k);
      inp.lookYaw = this.yaw0 + wrapPi(seatYaw - this.yaw0) * e;
    } else {
      const lim = (SIT.yawDeg * Math.PI) / 180;
      const d = wrapPi(inp.lookYaw - seatYaw);
      if (d > lim) inp.lookYaw = seatYaw + lim;
      else if (d < -lim) inp.lookYaw = seatYaw - lim;
    }
    // Q held: up again
    const fast = this.kmhOf(on.l) > SIT.maxKmh;
    this.qT = this.qDown ? this.qT + dt : 0;
    this.words[0] = fast ? { keys: ['Q'], hold: true, text: '起身', off: true, why: '车太快了' } : { keys: ['Q'], hold: true, text: '起身' };
    if (this.qT >= SIT.standS) {
      this.qT = 0;
      this.qDown = false;
      if (!this.stand()) {
        if (this.refused <= 0) ctx.player.flashWhy('车太快了');
        this.refused = 2;
      }
      return;
    }
    this.refused = Math.max(0, this.refused - dt);
    const pin = this.pin;
    pin.x = p.eye.x + o.x;
    pin.z = p.eye.z + o.z;
    pin.y = p.floor + o.y;
    pin.eye = p.eye.y - p.floor;
    pin.ring = fast ? 0 : this.qT / SIT.standS;
    ctx.player.pin = pin;
  }

  /** the piece one sits on (its body and its seats are not offered meanwhile) */
  sitsOn(l: Loose): boolean {
    return this.on?.l === l;
  }
}
