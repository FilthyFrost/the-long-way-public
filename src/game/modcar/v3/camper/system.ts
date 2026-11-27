/**
 * The camper's living (docs/V3/plan/rv.md, R1): the elevating roof and the beds.
 *
 *  - The elevating roof (a frame whose rig has a roof pop-up: the Turtle's shell, POPUP_roof). From outside, the left
 *    button held on the shell — 长按 升起车顶 / 放下车顶: up, one stands up in the room under it (the door and the seat
 *    let one in only then: aboard.ts `roof`); down, the vehicle may go. Up or down only standing with the engine off
 *    (先停车, 先熄火), down only with nobody in the room (先从车厢里出来). With it up the engine does not start (先把顶放下).
 *    Kept with the save.
 *  - The beds (aboard.ts `beds`: the Whale's bunk over the cab, the one built in since the living spaces were emptied —
 *    docs/V3/plan/finish.md §十九 step 7; and a cot, wherever it is put): in the living space, the left button held on
 *    one — 长按 睡觉 — and the night goes by as in a seat, but rested in six hours from nothing, not eight, with half
 *    again the health (ModGame.sleepInBed; vitals.ts). Not when rested (还不困), nor in a vehicle moving or running.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import type { SaveSlice } from '../../../../core/kernel/slices';
import type { Text } from '../../../../core/modcar/types';
import type { GameContext } from '../../kernel/context';
import type { GarageDevice } from '../../garageStub';
import type { ModVehicle } from '../../vehicle';

const T = (zh: string, en: string): Text => ({ zh, en });

/** the left button held this long on the elevating roof shell (s) */
const ROOF_HOLD_S = 0.8;

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
      if (roof && (!this.isUp(v) || aboard !== v)) out.push(this.deviceOf(`roof:${v.build.uid}`, () => this.roofDevice(v, roof)));
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

  telemetry(): Record<string, unknown> {
    return { up: [...this.up], raised: this.raised, lowered: this.lowered, slept: this.slept };
  }
}
