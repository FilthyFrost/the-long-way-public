/**
 * Lids (the player's ask, 2026-11-26: "I want to open the cooler's lid, but it only gets picked up — the aim does not say
 * which I mean"): Nomad Drive tells a press on a lid from a press on the thing — the mark on the lid lights the lid and a
 * press opens it or shuts it, the mark on the box anywhere else picks the box up. A thing that holds things and has a lid
 * of its own in its model (LID, hinged at its origin along the model's z: the cooler's) gets a device for its lid: a
 * press swings it open (about 110°) or shut; opened, what is in it is seen standing in it, each thing taken out by the
 * mark on it, and no list comes up (the player's ask, 2026-11-26: v3/nd-store). The box itself is still picked up as
 * any thing lying about is. Which lids stand open is the thing's own (ItemInstance.state.open, as a fridge's door's
 * is), so it is kept with the save — a lid left open stands open again when the game is gone on with; a thing taken
 * into the hands has its lid shut.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { COOLER } from '../../../../core/v3/kitchen/items';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { PlanPoint } from '../../kernel/interact';
import type { Loose } from '../../loose';
import { boxHit, modelOf, type PartBox } from '../../nd/kit';

const T = (zh: string, en: string): Text => ({ zh, en });

/** the kinds whose models' LID is a lid one opens (not a pot's lid: the kitchen's own) */
const LIDDED: ReadonlySet<string> = new Set([COOLER]);
/** how far it swings open (rad, about the hinge's +z: its free edge up) and how quickly (s) */
const OPEN = 1.92;
const SWING_S = 0.35;
const LID = 'LID';

interface Lid {
  l: Loose;
  model: THREE.Object3D;
  obj: THREE.Object3D;
  q0: THREE.Quaternion;
  box: PartBox;
  t: number;
  device: GarageDevice;
}

export class Lids implements System<GameContext> {
  readonly id = 'lids';
  private ctx: GameContext | null = null;
  private readonly lids = new Map<Loose, Lid>();
  private readonly q = new THREE.Quaternion();
  private readonly z = new THREE.Vector3(0, 0, 1);
  private readonly b3 = new THREE.Box3();
  private readonly inv = new THREE.Matrix4();
  /** what has been done (the harness's) */
  private opened = 0;
  private shut = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.interact.add({ near: (at, r, out) => this.near(at, r, out) });
  }

  private isOpen(l: Loose): boolean {
    return !!l.item?.state?.open?.includes(LID);
  }

  /** its lid's hinge and box, found on its model as it came in (null: no model yet, or no lid on it) */
  private dress(l: Loose): Lid | null {
    const model = modelOf(l);
    if (!model) return null;
    const had = this.lids.get(l);
    if (had && had.model === model) return had;
    const obj = model.getObjectByName(LID);
    if (!obj) return null;
    // (the lid's box in its own frame: its meshes, the handle and the catch with it)
    obj.updateWorldMatrix(true, true);
    this.inv.copy(obj.matrixWorld).invert();
    this.b3.makeEmpty();
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.computeBoundingBox();
      this.b3.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.inv, m.matrixWorld)));
    });
    if (this.b3.isEmpty()) return null;
    // (a little proud of it all round: the mark on its rim is on the lid)
    const box: PartBox = { min: [this.b3.min.x - 0.01, this.b3.min.y - 0.01, this.b3.min.z - 0.01], max: [this.b3.max.x + 0.01, this.b3.max.y + 0.02, this.b3.max.z + 0.01] };
    const self = this;
    const lid: Lid = {
      l,
      model,
      obj,
      q0: obj.quaternion.clone(),
      box,
      t: this.isOpen(l) ? 1 : 0,
      device: {
        id: `lids:${l.uid}`,
        // (its top, where the lid is: the box hit below is what counts)
        get x() {
          return l.x;
        },
        get y() {
          return l.y + 2 * l.mid - 0.03;
        },
        get z() {
          return l.z;
        },
        radius: 0.2,
        get loose() {
          return l;
        },
        get word(): Text {
          const name = l.item ? itemDef(l.item.item).name.zh : '';
          return self.isOpen(l) ? T(`盖上${name}`, 'Shut the lid') : T(`打开${name}`, 'Open the lid');
        },
        use: () => self.toggle(lid),
        hit: (ray, reach) => boxHit(lid.obj, ray, lid.box, reach),
      },
    };
    this.lids.set(l, lid);
    // (as it stands: a lid left open stands open when its model comes in again — a game gone on with)
    this.pose(lid);
    return lid;
  }

  /** the lid turned as far as it has swung open (t: 0 shut … 1 open) */
  private pose(lid: Lid): void {
    const k = lid.t * lid.t * (3 - 2 * lid.t);
    this.q.setFromAxisAngle(this.z, OPEN * k);
    lid.obj.quaternion.copy(lid.q0).multiply(this.q);
  }

  /** open or shut it (opened, what is in it stands in it: v3/nd-store) */
  toggle(lid: Lid): void {
    const ctx = this.ctx;
    const it = lid.l.item;
    if (!ctx || !it) return;
    const st = (it.state ??= {});
    const open = new Set(st.open ?? []);
    const now = !open.has(LID);
    if (now) open.add(LID);
    else open.delete(LID);
    if (open.size) st.open = [...open].sort();
    else delete st.open;
    ctx.loose.touch(lid.l);
    ctx.sound(now ? 'container_open' : 'door_house_close', 0.4);
    if (now) this.opened++;
    else this.shut++;
  }

  private near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const l of ctx.loose.list) {
      if (!l.item || !LIDDED.has(l.item.item) || l.shut) continue;
      const dx = l.x - at.x;
      const dz = l.z - at.z;
      const rr = r + l.radius + 0.3;
      if (dx * dx + dz * dz > rr * rr) continue;
      const lid = this.dress(l);
      if (lid) out.push(lid.device);
    }
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    // (a cooler taken into the hands: its lid shut, as it is carried)
    const h = ctx.player.held;
    if (h?.kind === 'item' && LIDDED.has(h.item.item) && h.item.state?.open) {
      delete h.item.state.open;
      if (!Object.keys(h.item.state).length) delete h.item.state;
    }
    for (const [l, lid] of this.lids) {
      if (!ctx.loose.list.includes(l) || modelOf(l) !== lid.model) {
        this.lids.delete(l);
        continue;
      }
      const want = this.isOpen(l) ? 1 : 0;
      if (lid.t === want) continue;
      lid.t = want > lid.t ? Math.min(1, lid.t + dt / SWING_S) : Math.max(0, lid.t - dt / SWING_S);
      this.pose(lid);
    }
  }

  telemetry(): Record<string, unknown> {
    return { lids: this.lids.size, opened: this.opened, shut: this.shut, open: [...this.lids.values()].filter((d) => this.isOpen(d.l)).length };
  }
}
