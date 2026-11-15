/**
 * The cab's operable parts, built the same way in every vehicle: each is a small piece of geometry
 * posed by a mover (so it costs no draw call: it rides in the room or the cluster mesh) and a
 * control point (`VehicleParts.controls`) that controls.ts turns into something to look at and use.
 *
 * Everything one can use carries the one accent colour (ACCENT): grips, knobs, the key's head.
 * Movers named `ctl:<id>` follow the vehicle systems (the lever is where the systems say it is);
 * the others (glovebox, visors, doors, windows) are opened and shut by hand.
 */
import * as THREE from 'three';
import { ModelBuilder } from './builder';
import type { ControlPoint, PosedPart, Reach } from './kit';
import { turnAbout } from './kit';
import * as P from './props';

/** "this can be used": the one accent colour of every grip, knob and key */
export const ACCENT = 0xe8743b;
const DARK = 0x393d45;
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export class CabParts {
  readonly controls: Record<string, ControlPoint> = {};
  /** posed parts for the room mesh, the cluster (hood) mesh and the body mesh */
  readonly room: PosedPart[] = [];
  readonly hood: PosedPart[] = [];
  readonly body: PosedPart[] = [];
  /** movers to register: [name, label] */
  readonly movers: [string, string][] = [];

  constructor(readonly y: (h: number) => number) {}

  private mover(name: string, label: string): void {
    if (!this.movers.some(([m]) => m === name)) this.movers.push([name, label]);
  }

  point(id: string, x: number, y: number, z: number, r: number, from: Reach[], needsOpen?: string): void {
    this.controls[id] = needsOpen ? { x, y, z, r, from, needsOpen } : { x, y, z, r, from };
  }

  /** the key in its lock: `at` = the lock's face, `axis` = towards the driver; turns a quarter and more to start */
  key(fixed: ModelBuilder, at: THREE.Vector3, axis: THREE.Vector3, from: Reach[], fixedIsHood = false): void {
    const a = axis.clone().normalize();
    const back = at.clone().addScaledVector(a, -0.03);
    fixed.bar(back.x, back.y, back.z, at.x, at.y, at.z, 0.045, DARK);
    fixed.bar(at.x, at.y, at.z, at.x + a.x * 0.003, at.y + a.y * 0.003, at.z + a.z * 0.003, 0.05, 0xb9c0c4);
    const k = new ModelBuilder();
    const tip = at.clone().addScaledVector(a, 0.04);
    k.bar(at.x, at.y, at.z, tip.x, tip.y, tip.z, 0.008, 0xb9c0c4);
    // the head: a flat accent tab across, a ring for the fob
    const side = new THREE.Vector3().crossVectors(a, Z).normalize();
    if (side.lengthSq() < 0.1) side.copy(Y);
    const h0 = tip.clone().addScaledVector(side, -0.018);
    const h1 = tip.clone().addScaledVector(side, 0.018);
    k.bar(h0.x, h0.y, h0.z, h1.x, h1.y, h1.z, 0.016, ACCENT);
    k.sphere(h1.x + side.x * 0.012, h1.y + side.y * 0.012 - 0.02, h1.z + side.z * 0.012, 0.012, PAL_FOB, 0);
    (fixedIsHood ? this.hood : this.room).push({ mover: 'ctl:key', geo: k.build(), pose: (t) => turnAbout(at.x, at.y, at.z, a, -1.3 * t) });
    this.mover('ctl:key', '钥匙');
    const p = at.clone().addScaledVector(a, 0.035);
    this.point('key', p.x, p.y, p.z, 0.05, from);
  }

  /** a stick from a floor pivot to its knob, swung about z (fore and aft) from angle a0 (t = 0) to a1 (t = 1) */
  stick(id: string, pivot: THREE.Vector3, knob: THREE.Vector3, a0: number, a1: number, from: Reach[], color = 0x8e969b): void {
    const b = new ModelBuilder();
    b.bar(pivot.x, pivot.y, pivot.z, knob.x, knob.y, knob.z, 0.022, color);
    b.sphere(knob.x, knob.y + 0.01, knob.z, 0.038, ACCENT);
    this.room.push({ mover: `ctl:${id}`, geo: b.build(), pose: (t) => turnAbout(pivot.x, pivot.y, pivot.z, Z, a0 + (a1 - a0) * t) });
    this.mover(`ctl:${id}`, id);
    const mid = (a0 + a1) / 2;
    const k = knob.clone().sub(pivot).applyAxisAngle(Z, mid).add(pivot);
    this.point(id, k.x, k.y + 0.01, k.z, 0.07, from);
  }

  /** a handbrake lever: pivot at its front, grip at the back; pulled = swung up */
  handbrake(fixed: ModelBuilder, pivot: THREE.Vector3, grip: THREE.Vector3, from: Reach[]): void {
    fixed.span(pivot.x - 0.04, pivot.x + 0.04, pivot.y - 0.03, pivot.y + 0.01, pivot.z - 0.03, pivot.z + 0.03, DARK);
    const b = new ModelBuilder();
    b.bar(pivot.x, pivot.y, pivot.z, grip.x, grip.y, grip.z, 0.032, DARK);
    const g0 = pivot.clone().lerp(grip, 0.55);
    b.bar(g0.x, g0.y, g0.z, grip.x, grip.y, grip.z, 0.048, ACCENT);
    b.box(grip.x - 0.012, grip.y, grip.z, 0.02, 0.02, 0.02, 0xb9c0c4); // the button at its end
    const lift = -0.5;
    this.room.push({ mover: 'ctl:handbrake', geo: b.build(), pose: (t) => turnAbout(pivot.x, pivot.y, pivot.z, Z, lift * t) });
    this.mover('ctl:handbrake', '手刹');
    const up = grip.clone().sub(pivot).applyAxisAngle(Z, lift / 2).add(pivot);
    this.point('handbrake', up.x, up.y, up.z, 0.08, from);
  }

  /**
   * A round knob on a face looking back at the driver (−x), with a pointer: `steps` positions over
   * a quarter turn and a half.
   */
  knob(id: string, at: THREE.Vector3, from: Reach[], steps = 4, axis = X): void {
    const b = new ModelBuilder();
    b.cyl(at.x - 0.012, at.y, at.z, 0.026, 0.024, DARK, { rz: Math.PI / 2, segments: 12 });
    b.cyl(at.x - 0.025, at.y, at.z, 0.022, 0.006, ACCENT, { rz: Math.PI / 2, segments: 12 });
    b.box(at.x - 0.03, at.y + 0.012, at.z, 0.006, 0.02, 0.006, 0xf3ead6); // the pointer
    const span = (Math.PI * 0.75 * (steps - 1)) / 3;
    this.room.push({ mover: `ctl:${id}`, geo: b.build(), pose: (t) => turnAbout(at.x, at.y, at.z, axis, span / 2 - span * t) });
    this.mover(`ctl:${id}`, id);
    this.point(id, at.x - 0.02, at.y, at.z, 0.04, from);
  }

  /** a push button on a face looking back (−x): pressed in while on */
  button(id: string, at: THREE.Vector3, from: Reach[], color: number): void {
    const b = new ModelBuilder();
    b.span(at.x - 0.02, at.x, at.y - 0.02, at.y + 0.02, at.z - 0.025, at.z + 0.025, color);
    b.hull([[at.x - 0.021, at.y - 0.012, at.z - 0.014], [at.x - 0.021, at.y - 0.012, at.z + 0.014], [at.x - 0.021, at.y + 0.013, at.z]], 0xf3ead6); // a triangle
    this.room.push({ mover: `ctl:${id}`, geo: b.build(), pose: (t) => new THREE.Matrix4().makeTranslation(0.008 * t, 0, 0) });
    this.mover(`ctl:${id}`, id);
    this.point(id, at.x - 0.02, at.y, at.z, 0.035, from);
  }

  /** the hand-crank radio: its body switches it on, its eye knobs tune and set the volume */
  radioBuddy(fixed: ModelBuilder, m: THREE.Matrix4, from: Reach[]): void {
    P.radioBuddy(fixed, m);
    const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z).applyMatrix4(m);
    for (const [id, z] of [['tune', -0.045], ['volume', 0.045]] as [string, number][]) {
      const c = new THREE.Vector3(0.078, 0.093, z);
      const b = new ModelBuilder();
      b.box(0.082, 0.093 + 0.011, z, 0.004, 0.012, 0.004, ACCENT);
      const geo = b.build().applyMatrix4(m);
      const w = c.clone().applyMatrix4(m);
      const ax = new THREE.Vector3(1, 0, 0).transformDirection(m);
      this.room.push({ mover: `ctl:${id}`, geo, pose: (t) => turnAbout(w.x, w.y, w.z, ax, -Math.PI * 1.5 * t) });
      this.mover(`ctl:${id}`, id);
      this.point(id, w.x, w.y, w.z, 0.03, from);
    }
    // the power lamp on top: lit (accent) when on
    const lb = new ModelBuilder();
    lb.sphere(0.03, 0.135, -0.07, 0.012, ACCENT, 0);
    const lamp = lb.build().applyMatrix4(m);
    this.room.push({ mover: 'ctl:radio', geo: lamp, pose: (t) => (t > 0.5 ? new THREE.Matrix4() : null) });
    this.mover('ctl:radio', '收音机');
    const c = at(0.07, 0.12, 0);
    this.point('radio', c.x, c.y, c.z, 0.05, from);
  }

  /** a lid hinged at its bottom edge on a face looking back (−x): falls open towards the cab */
  lid(id: string, p0: THREE.Vector3, p1: THREE.Vector3, from: Reach[], color: number, open = Math.PI / 2): void {
    const b = new ModelBuilder();
    b.span(p0.x, p1.x, p0.y, p1.y, p0.z, p1.z, color);
    b.box(p0.x - 0.006, p1.y - 0.02, (p0.z + p1.z) / 2, 0.012, 0.016, 0.07, ACCENT); // the catch
    this.room.push({ mover: id, geo: b.build(), pose: (t) => turnAbout(p1.x, p0.y, 0, Z, open * t) });
    this.mover(id, '手套箱');
    this.point(id, p0.x - 0.01, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2, 0.08, from);
  }

  /** a sun visor folded up under the header: hinged along its front edge (x = hinge), flips down */
  visor(id: string, fixed: ModelBuilder, hinge: number, yv: number, z0: number, z1: number, depth: number, from: Reach[], color: number): void {
    fixed.bar(hinge, yv, Math.min(z0, z1), hinge, yv, Math.max(z0, z1), 0.012, DARK);
    const b = new ModelBuilder();
    b.span(hinge - depth, hinge, yv - 0.016, yv, Math.min(z0, z1), Math.max(z0, z1), color);
    b.span(hinge - depth + 0.02, hinge - 0.02, yv - 0.019, yv - 0.016, (z0 + z1) / 2 - 0.06, (z0 + z1) / 2 + 0.06, 0xb9c0c4); // a little mirror
    this.room.push({ mover: id, geo: b.build(), pose: (t) => turnAbout(hinge, yv, 0, Z, 1.35 * t) });
    this.mover(id, '遮阳板');
    this.point(id, hinge - depth / 2, yv - 0.02, (z0 + z1) / 2, 0.08, from);
  }
}

const PAL_FOB = 0x6f86b5;
