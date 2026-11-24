/**
 * The camper's living (docs/V3/plan/rv.md, R1): the elevating roof and the beds.
 *
 *  - The elevating roof (a frame whose rig has a roof pop-up: the Turtle's shell, POPUP_roof). From outside, the left
 *    button held on the shell — 长按 升起车顶 / 放下车顶: up, one stands up in the room under it (the door and the seat
 *    let one in only then: aboard.ts `roof`); down, the vehicle may go. Up or down only standing with the engine off
 *    (先停车, 先熄火), down only with nobody in the room (先从车厢里出来). With it up the engine does not start (先把顶放下).
 *    Kept with the save.
 *  - The beds (aboard.ts `beds`: the Turtle's across the back, the Whale's over the cab): in the living space, the left
 *    button held on one — 长按 睡觉 — and the night goes by as in a seat, but rested in six hours from nothing, not eight,
 *    with half again the health (ModGame.sleepInBed; vitals.ts). Not when rested (还不困), nor in a vehicle moving or
 *    running.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import { aboardOf } from '../../../../core/modcar/aboard';
import type { Text } from '../../../../core/modcar/types';
import type { GameContext } from '../../kernel/context';
import type { GarageDevice } from '../../garageStub';
import type { ModVehicle } from '../../vehicle';
import type { Loose } from '../../loose';
import { heldOf, type Held } from '../../player';

/** the folding camp cot (core/v3/nd/items.ts ND_COT: named here, not imported — the camper does not bring Nomad Drive's kinds in with it) */
const ND_COT = 'nd_cot';

const T = (zh: string, en: string): Text => ({ zh, en });

/** the left button held this long on the shell, on a bed (s) */
const ROOF_HOLD_S = 0.8;
const BED_HOLD_S = 1.0;

/** a frame's elevating roof: its pop-up's name and where its shell is (model space) when down, how far it lifts */
interface RoofDef {
  name: string;
  /** the shell's box, down (model space) */
  min: THREE.Vector3;
  max: THREE.Vector3;
  lift: number;
}

/** the elevating roof of a frame (null: none) — from its rig's pop-up driven by the roof, its shell's size from the frame's cargo-free body */
export function roofOf(v: ModVehicle): RoofDef | null {
  const pops = v.view.frame.rig?.popups;
  if (!pops) return null;
  for (const [name, p] of Object.entries(pops)) {
    if (p.driver !== 'roof' || !p.lift) continue;
    const b = v.view.frame.body;
    // (the shell over most of the roof: the opening's length, a little in from the sides)
    return { name, min: new THREE.Vector3(b.rear + 0.2, p.pivot[1] - 0.06, -b.halfWidth + 0.08), max: new THREE.Vector3(b.front - 0.9, p.pivot[1] + 0.16, b.halfWidth - 0.08), lift: p.lift[1] };
  }
  return null;
}

export class Camper implements System<GameContext> {
  readonly id = 'camper';
  readonly budget = { cpuMs: 0.1 };
  private ctx: GameContext | null = null;
  /** the vehicles (build uid) with their roofs up */
  private readonly up = new Set<string>();
  private readonly devices = new Map<string, GarageDevice & { x: number; y: number; z: number }>();
  private readonly ray = new THREE.Ray();
  private readonly inv = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly hitP = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  /** what has been done here (the harness's) */
  private raised = 0;
  private lowered = 0;
  private slept = 0;

  readonly slice: SaveSlice<{ up: string[] }> = {
    id: 'camper',
    version: 1,
    snapshot: () => (this.up.size ? { up: [...this.up] } : undefined),
    restore: (data) => {
      this.up.clear();
      for (const u of data.up ?? []) this.up.add(u);
    },
    clear: () => this.up.clear(),
  };

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.interact.add({ near: (at, r, out) => this.near(at, r, out) });
    // (the roof up: the engine does not start)
    ctx.startBlockers?.push((v) => (this.isUp(v) ? T('先把顶放下', 'Lower the roof first') : null));
  }

  /** is this vehicle's elevating roof up (wanted up: it may still be on its way) */
  isUp(v: ModVehicle): boolean {
    return this.up.has(v.build.uid);
  }

  /** up or down now (the harness's; the hold does the same) */
  setUp(v: ModVehicle, up: boolean): boolean {
    if (!roofOf(v)) return false;
    if (up) this.up.add(v.build.uid);
    else this.up.delete(v.build.uid);
    v.view.roofUp = up;
    v.awake = 2;
    return true;
  }

  step(_dt: number, ctx: GameContext): void {
    // (each roof as it is wanted: a vehicle come back from the save, or out of sight and back)
    for (const v of ctx.vehicles) if (roofOf(v)) v.view.roofUp = this.up.has(v.build.uid);
  }

  // ------------------------------------------------------------------ the devices

  private near(at: { x: number; z: number }, r: number, out: GarageDevice[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const aboard = ctx.player.aboard?.v ?? null;
    for (const v of ctx.vehicles) {
      if (Math.hypot(v.sim.px - at.x, v.sim.pz - at.z) > r + 6) continue;
      const roof = roofOf(v);
      if (roof && aboard !== v) out.push(this.deviceOf(`roof:${v.build.uid}`, () => this.roofDevice(v, roof)));
      // (the beds of the living space one stands in)
      if (aboard === v) {
        const beds = aboardOf(v.view.frame.id)?.beds ?? [];
        beds.forEach((_b, i) => out.push(this.deviceOf(`bed:${v.build.uid}:${i}`, () => this.bedDevice(v, i))));
      }
    }
    // (a cot is a bed wherever it is: lying about, or put in a vehicle — the Camel's beds are the ones put in it)
    for (const l of ctx.loose.list) {
      if (l.item?.item !== ND_COT || Math.hypot(l.x - at.x, l.z - at.z) > r + 2) continue;
      out.push(this.deviceOf(`cot:${l.uid}`, () => this.cotDevice(l)));
    }
  }

  private deviceOf(id: string, make: () => GarageDevice & { x: number; y: number; z: number }): GarageDevice {
    let d = this.devices.get(id);
    if (!d) {
      d = make();
      this.devices.set(id, d);
    }
    return d;
  }

  /** a ray against a box of a vehicle's model (render space in, the distance along it, or null) */
  private hitBox(v: ModVehicle, ray: THREE.Ray, reach: number): number | null {
    const model = v.view.model;
    model.updateMatrixWorld();
    this.ray.copy(ray).applyMatrix4(this.inv.copy(model.matrixWorld).invert());
    const p = this.ray.intersectBox(this.box, this.hitP);
    if (!p) return null;
    const d = p.distanceTo(this.ray.origin);
    return d <= reach + 0.3 ? d : null;
  }

  private roofDevice(v: ModVehicle, roof: RoofDef): GarageDevice & { x: number; y: number; z: number } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const why = (): Text | null => {
      if (Math.abs(v.sim.kmh) > 1) return T('先停车', 'Stop first');
      if (v.sys.running) return T('先熄火', 'Switch the engine off first');
      return null;
    };
    return {
      id: `roof:${v.build.uid}`,
      x: v.sim.px,
      y: v.sim.py + 1.2,
      z: v.sim.pz,
      radius: 0.5,
      get word(): Text {
        return self.isUp(v) ? T('放下车顶', 'Lower the roof') : T('升起车顶', 'Raise the roof');
      },
      get why(): Text | null {
        return why();
      },
      get state(): Text {
        return self.isUp(v) ? T('升着', 'Up') : T('放着', 'Down');
      },
      holdS: ROOF_HOLD_S,
      hit(ray: THREE.Ray, reach: number): number | null {
        const lift = v.view.roofT * roof.lift;
        self.box.min.copy(roof.min);
        self.box.max.copy(roof.max);
        self.box.min.y += lift;
        self.box.max.y += lift;
        return self.hitBox(v, ray, reach);
      },
      use(): void {
        const ctx = self.ctx;
        if (!ctx || why()) return;
        const up = !self.isUp(v);
        self.setUp(v, up);
        if (up) self.raised++;
        else self.lowered++;
        ctx.sound('ratchet_done', 0.8);
        ctx.ui.say(up ? '车顶升起来了' : '车顶放下了', 1.6);
      },
    };
  }

  private bedDevice(v: ModVehicle, i: number): GarageDevice & { x: number; y: number; z: number } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const bed = aboardOf(v.view.frame.id)!.beds![i];
    const why = (): Text | null => {
      if (Math.abs(v.sim.kmh) > 1) return T('车还在动', 'Still moving');
      if (v.sys.running) return T('先熄火', 'Switch the engine off first');
      if ((self.ctx?.body.energy ?? 100) >= 80) return T('还不困', 'Not tired');
      return null;
    };
    return {
      id: `bed:${v.build.uid}:${i}`,
      x: v.sim.px,
      y: v.sim.py,
      z: v.sim.pz,
      radius: 0.5,
      word: T('睡觉', 'Sleep'),
      get why(): Text | null {
        return why();
      },
      state: T('床', 'Bed'),
      holdS: BED_HOLD_S,
      hit(ray: THREE.Ray, reach: number): number | null {
        self.box.min.set(bed.x0, bed.top - 0.12, bed.z0);
        self.box.max.set(bed.x1, bed.top + 0.06, bed.z1);
        return self.hitBox(v, ray, reach);
      },
      use(): void {
        const ctx = self.ctx;
        if (!ctx || why()) return;
        const no = ctx.sleepInBed?.() ?? T('睡不了', 'Cannot sleep');
        if (no) ctx.player.flashWhy(no.zh);
        else self.slept++;
      },
    };
  }

  /** a cot (a loose thing) as a bed: 长按 睡觉 on its canvas; not in a vehicle moving or running */
  private cotDevice(l: Loose): GarageDevice & { x: number; y: number; z: number } {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const lr = new THREE.Ray();
    const lb = new THREE.Box3();
    const lm = new THREE.Matrix4();
    const vehicle = (): ModVehicle | null => {
      const on = l.riding?.on;
      if (!on || !self.ctx) return null;
      for (const v of self.ctx.vehicles) if ((v as unknown) === on) return v;
      return null;
    };
    const why = (): Text | null => {
      const v = vehicle();
      if (v && Math.abs(v.sim.kmh) > 1) return T('车还在动', 'Still moving');
      if (v?.sys.running) return T('先熄火', 'Switch the engine off first');
      if ((self.ctx?.body.energy ?? 100) >= 80) return T('还不困', 'Not tired');
      return null;
    };
    return {
      id: `cot:${l.uid}`,
      get x(): number {
        return l.x;
      },
      get y(): number {
        return l.y + 0.4;
      },
      get z(): number {
        return l.z;
      },
      radius: 0.6,
      word: T('睡觉', 'Sleep'),
      get why(): Text | null {
        return why();
      },
      state: T('折叠床', 'Camp cot'),
      holdS: BED_HOLD_S,
      hit(ray: THREE.Ray, reach: number): number | null {
        // (its canvas: the cot's box in its own frame, its top band)
        if (!l.obj || l.shut) return null;
        l.obj.updateMatrixWorld();
        lr.copy(ray).applyMatrix4(lm.copy(l.obj.matrixWorld).invert());
        lb.min.set(-0.36, 0.25, -0.96);
        lb.max.set(0.36, 0.5, 0.96);
        const p = lr.intersectBox(lb, self.hitP);
        if (!p) return null;
        const d = p.distanceTo(lr.origin);
        if (d > reach + 0.3) return null;
        // (riding in a vehicle: as a thing lying in it is offered, nearer than the vehicle's coarse body round it)
        return l.riding ? Math.max(0, d - 1.2) + d * 0.001 : d;
      },
      // (the left button held picks the cot itself up, as any thing lying about)
      grabbable(): NonNullable<Held> | null {
        return heldOf(l);
      },
      grab(): boolean {
        return self.ctx?.player.takeLoose(l) ?? false;
      },
      use(): void {
        const ctx = self.ctx;
        if (!ctx || why()) return;
        const no = ctx.sleepInBed?.() ?? T('睡不了', 'Cannot sleep');
        if (no) ctx.player.flashWhy(no.zh);
        else self.slept++;
      },
    };
  }

  telemetry(): Record<string, unknown> {
    return { up: [...this.up], raised: this.raised, lowered: this.lowered, slept: this.slept };
  }
}
