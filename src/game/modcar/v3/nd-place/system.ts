/**
 * Placing a thing where one wants it, as Nomad Drive does (docs/ND/PLAN.md, ND4; the rules and its numbers:
 * core/v3/nd/place.ts; docs/V3/plan/hands.md §四, docs/V3/plan/prompts.md §四 since). R with something in the hands
 * holds it out before the eye at its own size, facing one until it is turned; R again takes it back.
 *
 * Where it goes: one line of sight a frame (losHit: the vehicles near by their own shapes, the hands' triangle grids;
 * the world's surface stepped along) — onto a vehicle's place for things it lands in (its bed, its boot, a seat, a
 * motorhome's floor, table, worktop or wall: cargo.ts landing, not one behind the vehicle's own wall), onto another
 * surface it meets (the ground, a floor, a vehicle's roof, bonnet or bumper: its box's lowest point on it, the highest
 * of five points under its footprint), its middle on the point looked at; else floating, short of what is in the way,
 * its ghost where it would come down. It is put down (the left button) exactly where it shows, if nothing is in the
 * way — the left button where it may not go says why, once, and goes (docs/V3/plan/prompts.md §五). Before all that, a
 * slot of a system's the line of sight meets (slots.ts: a stove's burner for a pan, a pot or a kettle) takes it onto
 * its middle, turned as it is held — Q and E turn it there on the burner's own squares — and it stays so turned.
 *
 * The grid (the user's "按下Q或者E就自动进入网格的模式…车的网格"): Q or E turns it a quarter round to the next square of
 * the grid it is on (0.2 s) and puts it on that grid — its footprint's edges on the lines of 10 cm squares, drawn round
 * it on what it goes onto (grid.ts). The grid is a vehicle's own when it goes on or in one, when one stands in one, or
 * on the ground within 3 m of one (the lines in a motorhome go on behind it); else the world's, north up. The right
 * button held turns it freely with the mouse while the view holds still, and takes it off the grid. The wheel: how far
 * off it floats. Put down on a vehicle, it rides with it. Not seated, not sitting.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { footprint as zoneFootprint, gridAt, latticeOrigin, LIDLESS_WHY, zoneLidless, zonesFor, type CargoZone, type Placed, type Spot } from '../../../../core/modcar/cargo';
import { itemDef } from '../../../../core/modcar/items';
import { ND_FRIDGE } from '../../../../core/v3/nd/items';
import { circleInRect, distToRect, firstBlocking, footprint, latticeShift, nearestQuarter, nextQuarter, outBack, outCubic, PLACE, pointInBlock, stepDistance, type Box3, type Rect } from '../../../../core/v3/nd/place';
import type { Solid } from '../../../../core/world/solids';
import type { MountDef } from '../../../../core/modcar/types';
import { applyGhost, type GhostKind } from '../../../render/carMaterials';
import { massOf, type StowAim } from '../../cargo';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { BoardAim, Loose } from '../../loose';
import { heldOf, type HandsUse, type Held } from '../../player';
import type { ModVehicle } from '../../vehicle';
import { PlaceGrid } from './grid';
import { placeSlots, turnOnSlot, type SlotAim } from './slots';

type Thing = NonNullable<Held>;

/** the kinds held out further (Nomad Drive's fridges) */
const FAR = new Set([ND_FRIDGE]);

/** where it would go now */
interface Aim {
  ok: boolean;
  /** why not, in a word or two (said when the left button is pressed where it may not go) */
  why: string;
  /** a vehicle's place for things it goes into (null: free) */
  stow: StowAim | null;
  /** a vehicle's place it would go into but does not fit: where it is shown, red (frame model space) */
  tryStow: Spot | null;
  /** free: where its base comes down (world), what it lands on (a vehicle: it rides there), whether that is a surface rather than the bare ground */
  x: number;
  y: number;
  z: number;
  on: ModVehicle | null;
  surface: boolean;
  /** on the surface the line of sight meets (shown there), not floating with its ghost below */
  onSurface?: boolean;
  /** a slot of a system's it goes onto (a stove's burner: slots.ts), shown there turned as it is held */
  slot?: SlotAim | null;
  /** a compatible empty vehicle mount snapped magnetically while placing a part (PlacementSlotBridge) */
  partSlot?: { v: ModVehicle; mount: MountDef; sub: string | null; key: string } | null;
  /** a container's board it goes onto (v3/nd-store): the container takes it, as what it holds (loose.ts BoardAim.put) */
  put?: BoardAim['put'] | null;
  /** the thing lying about it goes onto (a chest's lid, a table's top) */
  under?: Loose | null;
}

/** the grid a thing is on: a vehicle's (in its model's frame, its lines through its first place for things' corner) or the world's */
interface GridFrame {
  v: ModVehicle | null;
  /** its heading on the plan (rad: its x axis (cos, sin) on x, z) */
  yaw: number;
  /** the lattice's origin in the vehicle's model (x, z) */
  ox: number;
  oz: number;
}

const WORLD: GridFrame = { v: null, yaw: 0, ox: 0, oz: 0 };

/**
 * A piece of furniture placed in a room goes against a wall its back is within this of (m), a wall or another piece
 * its side is within this of (docs/V3/plan/finish.md §十一 3.2); as far into either counts as near
 */
const SNAP_BACK = 0.08;
const SNAP_SIDE = 0.05;

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
const UP = new THREE.Vector3(0, 1, 0);

/** a vehicle's heading on the plan (rad: its front (cos, sin) on x, z) */
function headingOf(v: ModVehicle, b: Float64Array): number {
  v.sim.basis(b);
  return Math.atan2(b[2], b[0]);
}

export class NdPlace implements System<GameContext> {
  readonly id = 'nd-place';
  readonly budget = { cpuMs: 0.6 };
  private ctx: GameContext | null = null;
  /** the thing being placed (it stays in the hands' slot until it is put down) */
  private thing: Thing | null = null;
  private d: number = PLACE.dist.start;
  private range: { readonly start: number; readonly min: number; readonly max: number } = PLACE.dist;
  /** its heading (the plan's), the quarter turn under way (Q, E), whether it still faces one */
  private yaw = 0;
  private turnFrom = 0;
  private turnTo = 0;
  private turnT = 1;
  private facing = true;
  /** on the grid (Q or E since it came out, the right button's turn not since) */
  gridOn = false;
  /** the grid it is on now (or would be on: Q and E turn it to this one's squares) */
  private gf: GridFrame = WORLD;
  /** the right button held (as the last frame had it), and the view as it was then: it holds still while the thing turns */
  private f = false;
  private frozen: { yaw: number; pitch: number } | null = null;
  /** where it is shown (render space: its box's middle), turned how */
  private readonly shownP = new THREE.Vector3();
  private readonly shownQ = new THREE.Quaternion();
  private shownInit = false;
  private aim: Aim = { ok: false, why: '', stow: null, tryStow: null, x: 0, y: 0, z: 0, on: null, surface: false };
  private ghost: { key: string; group: THREE.Group; kind: GhostKind } | null = null;
  private ghostToken = 0;
  private line: THREE.Line | null = null;
  private grid: PlaceGrid | null = null;
  /** things just put down, coming to their size */
  private readonly pops: { l: Loose; t: number }[] = [];
  private wasAside = false;
  private off: (() => void) | null = null;
  private readonly b9 = new Float64Array(9);
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly ray = new THREE.Ray();
  private readonly p = new THREE.Vector3();
  /** the middle of where it is shown this frame (render space): the grid round it */
  private readonly mid = new THREE.Vector3();
  private readonly tq = new THREE.Quaternion();
  private readonly tq2 = new THREE.Quaternion();
  private readonly tp = new THREE.Vector3();
  private readonly tp2 = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  private readonly m4b = new THREE.Matrix4();
  private readonly m3 = new THREE.Matrix3();
  private readonly lat = new THREE.Matrix4();
  private readonly near: Solid[] = [];
  /** each vehicle's grid origin (its first place for things' rear left corner — a room's walls' own: cargo.ts latticeOrigin; model x and z) */
  private readonly origins = new Map<string, { ox: number; oz: number }>();
  /** the room a piece of furniture was last turned back to the wall in (vehicle and place): once as it comes onto its squares */
  private backedIn = '';
  /** the harness's: where the thing lands in a vehicle's place, in place of the line of sight's own (null: the game's) */
  private forced: { v: ModVehicle; zone: CargoZone; x: number; z: number; dist: number } | null = null;
  /** put down so far (the harness) */
  placed = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    // (asked before the other systems' ways with the thing: while placing, its buttons are these)
    ctx.player.hands.unshift(this.hands);
    ctx.player.keyNotes.push((h) => (this.thing || ctx.seated || ctx.player.pin ? null : { keys: ['R'], text: '摆放' }));
    // (R puts it out to be placed and takes it back; Q and E turn it onto the grid: the game asks through this — docs/V3/plan/prompts.md §四)
    ctx.player.placer = this;
  }

  dispose(): void {
    this.off?.();
    this.stop();
    this.ghost?.group.removeFromParent();
    this.line?.removeFromParent();
    this.grid?.dispose();
  }

  /** placing now (the harness) */
  get placing(): boolean {
    return this.thing !== null;
  }

  // ------------------------------------------------------------------ in and out

  /** R: hold out what is in the hands, or take it back */
  toggle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.thing) return this.stop();
    const h = ctx.player.held;
    if (!h || ctx.seated || ctx.player.pin || ctx.player.aside) return;
    this.thing = h;
    this.range = h.kind === 'item' && FAR.has(h.item.item) ? PLACE.far : PLACE.dist;
    // (held out far enough to clear oneself: a door or a seat starts further off than a can — docs/V3/plan/growth.md J1)
    const box = ctx.cargo.boxOf(h);
    const half = box ? Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2 : 0;
    this.d = Math.min(this.range.max, Math.max(this.range.start, half + 0.6));
    // (facing one as it comes out, and so it stays until it is turned: not the view's every frame; off the grid until Q or E)
    this.yaw = ctx.input.lookYaw + Math.PI;
    this.gridOn = false;
    this.backedIn = '';
    this.facing = false;
    this.turnT = 1;
    this.frozen = null;
    this.f = false;
    this.shownInit = false;
    this.wasAside = ctx.player.aside;
    ctx.player.aside = true;
    ctx.cargo.boxOf(h);
  }

  /** back in the hands (or gone from them) */
  stop(): void {
    const ctx = this.ctx;
    if (!ctx || !this.thing) return;
    this.thing = null;
    this.frozen = null;
    ctx.heldThing.pinFor(null);
    ctx.player.aside = this.wasAside;
    if (this.ghost) this.ghost.group.visible = false;
    if (this.line) this.line.visible = false;
    this.grid?.hide();
  }

  // ------------------------------------------------------------------ the buttons

  readonly hands: HandsUse = {
    id: 'nd-place',
    claims: (h) => this.thing !== null && h === this.thing,
    press: () => {
      this.put();
      return true;
    },
    release: () => true,
    wheel: (_h, delta) => {
      // (by how far it turned: a notch a hundred of the browser's units)
      const n = Math.max(1, Math.round(Math.abs(delta) / 100));
      this.d = stepDistance(this.d, delta < 0 ? n : -n, this.range);
      return true;
    },
    takesRmb: () => true,
    step: (_h, dt, _e, rmb) => this.frame(dt, !!rmb),
    words: () => this.words(),
    gone: () => this.stop(),
  };

  /** Q (−1) and E (+1): a quarter round to the next square of the grid it is on, and onto that grid */
  turnStep(dir: 1 | -1): void {
    if (!this.thing) return;
    const from = this.turnT < 1 ? this.turnTo : this.yaw;
    this.facing = false;
    this.gridOn = true;
    this.turnFrom = this.yaw;
    this.turnTo = nextQuarter(from, dir, this.gf.yaw);
    this.turnT = 0;
    this.ctx?.sound('switch', 0.25);
  }

  /**
   * what the keys do while placing: Nomad Drive's few words (距离、释放、旋转、向左旋转、向右旋转、取消; Q and E 旋转 — the
   * player's ask, 2026-11-26), the left button's only where it may go — onto a burner, its own word
   */
  private words(): Action[] {
    const out: Action[] = [];
    if (this.aim.ok) out.push({ keys: ['LMB'], text: this.aim.partSlot ? '安装' : this.aim.slot?.word || '放下' });
    out.push({ keys: ['Q', 'E'], text: '旋转' }, { keys: ['RMB'], hold: true, text: '自由转' }, { keys: ['Wheel'], text: '距离' }, { keys: ['R'], text: '取消' });
    return out;
  }

  // ------------------------------------------------------------------ every frame

  /** before the walk: the view held still while the right button turns the thing (and takes it off the grid) */
  preStep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.thing || !this.f || !this.frozen) return;
    const inp = ctx.input;
    const dy = wrapPi(inp.lookYaw - this.frozen.yaw);
    if (Math.abs(dy) > 1e-6) {
      this.yaw += dy * PLACE.turnPerLook;
      this.facing = false;
      this.turnT = 1;
      this.gridOn = false;
    }
    inp.lookYaw = this.frozen.yaw;
    inp.lookPitch = this.frozen.pitch;
  }

  /** its heading as it is to be put: where a quarter turn under way is going */
  private poseYaw(): number {
    return this.turnT < 1 ? this.turnTo : this.yaw;
  }

  private frame(dt: number, f: boolean): void {
    const ctx = this.ctx!;
    const h = this.thing;
    if (!h) return;
    if (ctx.seated || ctx.player.pin) return this.stop();
    // the right button: the view as it is now held while it stays down
    if (f && !this.frozen) this.frozen = { yaw: ctx.input.lookYaw, pitch: ctx.input.lookPitch };
    if (!f) this.frozen = null;
    this.f = f;
    // facing one (its front to the eye) until turned; a quarter turn under way
    if (this.facing) this.yaw = ctx.input.lookYaw + Math.PI;
    if (this.turnT < 1) {
      this.turnT = Math.min(1, this.turnT + dt / PLACE.stepS);
      this.yaw = this.turnFrom + (this.turnTo - this.turnFrom) * outCubic(this.turnT);
    }
    const tb = ctx.cargo.boxOf(h);
    const box: Box3 = tb ?? { minX: -0.2, maxX: 0.2, minY: 0, maxY: 0.3, minZ: -0.2, maxZ: 0.2 };
    const centre = this.tp.set((box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2, (box.minZ + box.maxZ) / 2);
    const o = ctx.core.origin;
    const pl = ctx.player;
    const eye = this.eye.set(pl.eye.x - o.x, pl.eye.y - o.y, pl.eye.z - o.z);
    const dir = this.dir.set(pl.dir.x, pl.dir.y, pl.dir.z).normalize();
    this.ray.set(eye, dir);
    this.findAim(h, box, eye, dir);
    // on the grid: its heading kept on the squares of the grid it is on now (another vehicle's, the world's)
    if (this.gridOn && this.turnT >= 1) {
      const q = nearestQuarter(this.yaw, this.gf.yaw);
      if (Math.abs(wrapPi(q - this.yaw)) > 1e-4) {
        this.turnFrom = this.yaw;
        this.turnTo = this.yaw + wrapPi(q - this.yaw);
        this.turnT = 0;
      }
    }
    // where it is shown: at the vehicle's spot, on the surface, or floating before the eye
    const a = this.aim;
    const spot = a.stow ? (a.stow.spot ?? a.tryStow) : null;
    let k: number;
    if (a.partSlot && ctx.player.ghosts.poseOf(a.partSlot.key, this.tp2, this.tq)) {
      // Magnetic slot snap while placing a car part: pull smoothly into the slot pose.
      this.p.copy(centre).applyQuaternion(this.tq).add(this.tp2);
      k = PLACE.planeK;
    } else if (a.slot) {
      // (onto a slot — a stove's burner: its own origin on the slot's middle, turned about the slot's up as it is held)
      this.tq.copy(a.slot.q).multiply(this.tq2.setFromAxisAngle(UP, turnOnSlot(this.poseYaw(), a.slot.yaw)));
      this.p.copy(centre).applyQuaternion(this.tq).add(a.slot.pos);
      k = PLACE.planeK;
    } else if (a.stow && spot) {
      const model = a.stow.v.view.model;
      model.updateMatrixWorld(true);
      this.m4.makeRotationY(spot.yaw);
      if (spot.lie === 'z') this.m4.multiply(this.m4b.makeRotationZ(Math.PI / 2));
      else if (spot.lie === 'x') this.m4.multiply(this.m4b.makeRotationX(-Math.PI / 2));
      this.m4.setPosition(spot.x, spot.y, spot.z).premultiply(model.matrixWorld);
      this.p.copy(centre).applyMatrix4(this.m4);
      this.tq.setFromRotationMatrix(this.m4);
      k = PLACE.planeK;
    } else if (a.surface && a.onSurface) {
      // (on the surface the line of sight meets: shown where it will be)
      const y = this.poseYaw();
      const c = Math.cos(y);
      const s = Math.sin(y);
      this.p.set(a.x + centre.x * c - centre.z * s - o.x, a.y + centre.y - o.y, a.z + centre.x * s + centre.z * c - o.z);
      this.tq.setFromAxisAngle(UP, -y);
      k = PLACE.planeK;
    } else {
      this.p.copy(dir).multiplyScalar(this.d).add(eye);
      this.keepShort(this.p, eye, dir);
      this.tq.setFromAxisAngle(UP, -this.yaw);
      k = PLACE.floatK;
    }
    if (!this.shownInit) {
      this.shownP.copy(this.p);
      this.shownQ.copy(this.tq);
      this.shownInit = true;
    } else {
      const e = 1 - Math.exp(-dt * k);
      this.shownP.lerp(this.p, e);
      this.shownQ.slerp(this.tq, e);
    }
    this.mid.copy(this.p);
    // (seen through where it stands over the middle of the view, as it is carried)
    ctx.heldThing.pinFor({ pos: this.shownP, q: this.shownQ, at: centre, see: true });
    this.showGhost(h, box, centre);
    this.showGrid(box);
  }

  // ------------------------------------------------------------------ the grid

  /** a vehicle's grid: its heading, its lattice through its first place for things' corner */
  private frameOf(v: ModVehicle, zone?: CargoZone): GridFrame {
    const id = v.view.frame.id;
    // (in a room: that room's own squares, from its walls' corner)
    if (zone?.walls) return { v, yaw: headingOf(v, this.b9), ox: zone.x[0], oz: zone.z[0] };
    let g = this.origins.get(id);
    if (!g) {
      const at = latticeOrigin(id);
      g = { ox: at.x, oz: at.z };
      this.origins.set(id, g);
    }
    return { v, yaw: headingOf(v, this.b9), ox: g.ox, oz: g.oz };
  }

  /**
   * A piece of furniture's place in a room moved against what it stands by (docs/V3/plan/finish.md §十一 3.2), in the
   * room's frame. By where it is held (hx, hz — before the squares took it): its back within 8 cm of the wall behind
   * it goes against that wall, a side within 5 cm of a wall against that; a side within 5 cm of another big thing's
   * side, the two overlapping along it, goes against that one; a little into either counts as near. Along a way it
   * goes against nothing it keeps to its squares (x, z). Only square to the room (a quarter turn of its frame): turned
   * freely it is put where it is shown.
   */
  private againstWalls(box: Box3, hx: number, hz: number, x: number, z: number, sy: number, zone: CargoZone, placed: readonly Placed[]): { x: number; z: number } {
    if (Math.abs(Math.sin(2 * sy)) > 0.03) return { x, z };
    const ext = (q: [number, number][]): [number, number, number, number] => [Math.min(...q.map((p) => p[0])), Math.max(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[1]))];
    const [x0, x1, z0, z1] = ext(zoneFootprint(box, hx, hz, sy));
    // which way its back (its −x) faces in the room: −x, +x, −z or +z
    const bx = -Math.cos(sy);
    const bz = Math.sin(sy);
    const lim = (dx: number, dz: number): number => (dx * bx + dz * bz > 0.7 ? SNAP_BACK : SNAP_SIDE);
    const within = (d: number, l: number): boolean => d >= -l && d <= l;
    // (how far to move it along x and along z to stand against something: NaN, nothing there)
    let dx = NaN;
    let dz = NaN;
    // the walls
    if (within(x0 - zone.x[0], lim(-1, 0))) dx = zone.x[0] - x0;
    else if (within(zone.x[1] - x1, lim(1, 0))) dx = zone.x[1] - x1;
    if (within(z0 - zone.z[0], lim(0, -1))) dz = zone.z[0] - z0;
    else if (within(zone.z[1] - z1, lim(0, 1))) dz = zone.z[1] - z1;
    // the pieces beside it (big things square to the room: a cupboard, a fridge — not a tin on the floor); along the
    // other way it is where the wall or its squares put it
    const ax = Number.isNaN(dx) ? x - hx : dx;
    const az = Number.isNaN(dz) ? z - hz : dz;
    for (const p of placed) {
      if (Math.abs(Math.sin(2 * p.yaw)) > 0.03 || Math.max(p.box.maxX - p.box.minX, p.box.maxZ - p.box.minZ) < 0.35) continue;
      const [a0, a1, c0, c1] = ext(zoneFootprint(p.box, p.x, p.z, p.yaw));
      if (Number.isNaN(dx) && z0 + az < c1 - 0.05 && z1 + az > c0 + 0.05) {
        if (within(x0 - a1, SNAP_SIDE)) dx = a1 - x0;
        else if (within(a0 - x1, SNAP_SIDE)) dx = a0 - x1;
      }
      if (Number.isNaN(dz) && x0 + ax < a1 - 0.05 && x1 + ax > a0 + 0.05) {
        if (within(z0 - c1, SNAP_SIDE)) dz = c1 - z0;
        else if (within(c0 - z1, SNAP_SIDE)) dz = c0 - z1;
      }
    }
    return { x: Number.isNaN(dx) ? x : hx + dx, z: Number.isNaN(dz) ? z : hz + dz };
  }

  /** the grid for a point (world): what it goes on, the vehicle one stands in, one within 3 m of it; else the world's */
  private frameAt(x: number, z: number, on: ModVehicle | null): GridFrame {
    const ctx = this.ctx!;
    if (on) return this.frameOf(on);
    const ab = ctx.player.aboard?.v ?? null;
    if (ab) return this.frameOf(ab);
    let best: ModVehicle | null = null;
    let bd: number = PLACE.nearVehicle;
    for (const v of ctx.vehicles) {
      const b = v.sim.spec.body;
      const hd = headingOf(v, this.b9);
      const r: Rect = { x: v.sim.px + Math.cos(hd) * b.centerX, z: v.sim.pz + Math.sin(hd) * b.centerX, hx: b.halfLength, hz: b.halfWidth, yaw: hd };
      const d = distToRect(x, z, r);
      if (d <= bd) {
        bd = d;
        best = v;
      }
    }
    return best ? this.frameOf(best) : WORLD;
  }

  /** render space to the grid's own (its x and z the squares', a line through 0): a vehicle's model less its origin, or the world's (its phase only) */
  private toLattice(fr: GridFrame, out: THREE.Matrix4): THREE.Matrix4 {
    if (fr.v) {
      const model = fr.v.view.model;
      model.updateMatrixWorld(true);
      return out.copy(model.matrixWorld).invert().premultiply(this.m4b.makeTranslation(-fr.ox, 0, -fr.oz));
    }
    // (the world's lines where its metres are, without its large numbers: the floating origin's phase within half a metre)
    const o = this.ctx!.core.origin;
    const ph = (v: number): number => v - Math.floor(v / 0.5) * 0.5;
    return out.makeTranslation(ph(o.x), 0, ph(o.z));
  }

  /** a pivot (world x, z, standing at y) moved for the thing's footprint's edges to lie on the grid's lines */
  private snapWorld(box: Box3, bx: number, bz: number, y: number, fr: GridFrame): { x: number; z: number } {
    const f = footprint(box, bx, bz, this.poseYaw());
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    const o = this.ctx!.core.origin;
    const L = this.toLattice(fr, this.lat);
    const us: number[] = [];
    const ws: number[] = [];
    for (const [u, w] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const p = this.tp2.set(f.x + u * f.hx * c - w * f.hz * s - o.x, y - o.y, f.z + u * f.hx * s + w * f.hz * c - o.z).applyMatrix4(L);
      us.push(p.x);
      ws.push(p.z);
    }
    const { du, dw } = latticeShift(us, ws, PLACE.cell);
    if (!fr.v) return { x: bx + du, z: bz + dw };
    // (the shift in the vehicle's frame, back onto the plan)
    fr.v.view.model.updateMatrixWorld(true);
    const m = this.tp2.set(du, 0, dw).applyMatrix3(this.m3.setFromMatrix4(fr.v.view.model.matrixWorld));
    return { x: bx + m.x, z: bz + m.z };
  }

  /** the grid's lines round it on what it goes onto (on the grid only), squared to the vehicle's or the world's */
  private showGrid(box: Box3): void {
    const ctx = this.ctx!;
    const a = this.aim;
    const fr = this.gf;
    const spot = a.stow ? (a.stow.spot ?? a.tryStow) : null;
    // (not on a slot: a burner or magnetic vehicle mount shows no squares)
    const onIt = this.gridOn && !!this.thing && !a.slot && !a.partSlot && ((a.stow && spot && !a.stow.zone.wall) || (a.surface && a.onSurface));
    if (!onIt) {
      this.grid?.hide();
      return;
    }
    this.grid ??= new PlaceGrid(ctx.core.scene, PLACE.cell);
    const o = ctx.core.origin;
    const L = this.toLattice(fr, this.lat);
    // the thing's middle on the plan (render space), its reach
    const half = Math.hypot(box.maxX - box.minX, box.maxZ - box.minZ) / 2;
    const R = Math.min(PLACE.gridR.max, Math.max(PLACE.gridR.min, half * PLACE.gridR.k));
    const mid = this.tp2.copy(this.mid).applyMatrix4(L);
    const u = mid.x;
    const w = mid.z;
    // the corners of the patch on the surface: flat on a vehicle's floor or roof (as Nomad Drive's planes are: the seats and walls
    // stand through it), the ground from its height
    const inv = this.m4.copy(L).invert();
    let at: (u: number, w: number, out: THREE.Vector3) => void;
    let kind: string;
    if (a.stow && spot && fr.v === a.stow.v) {
      const floor = spot.y + box.minY;
      const model = a.stow.v.view.model.matrixWorld;
      at = (uu, ww, out) => out.set(uu + fr.ox, floor + 0.004, ww + fr.oz).applyMatrix4(model);
      kind = `z:${a.stow.zone.id}:${floor.toFixed(3)}`;
    } else if (a.on && fr.v === a.on) {
      const model = a.on.view.model;
      model.updateMatrixWorld(true);
      const my = this.tp2.set(a.x - o.x, a.y + box.minY - o.y, a.z - o.z).applyMatrix4(this.m4b.copy(model.matrixWorld).invert()).y;
      const mw = model.matrixWorld;
      at = (uu, ww, out) => out.set(uu + fr.ox, my + 0.004, ww + fr.oz).applyMatrix4(mw);
      kind = `v:${my.toFixed(3)}`;
    } else {
      const top = a.y + box.minY;
      // (the lattice's points at the height of the surface under it — a vehicle's grid tilts with it — then on the ground there)
      const ly = this.tp2.set(a.x - o.x, top - o.y, a.z - o.z).applyMatrix4(L).y;
      at = (uu, ww, out) => {
        out.set(uu, ly, ww).applyMatrix4(inv);
        const gy = ctx.loose.surfaceAt(out.x + o.x, out.z + o.z, top + 0.6);
        out.y = (gy ?? top) - o.y + 0.01;
      };
      kind = `w:${top.toFixed(3)}`;
    }
    const m = fr.v ? fr.v.view.model.matrixWorld.elements : null;
    const key = `${fr.v ? fr.v.view.frame.id : 'world'}|${kind}|${Math.round(u * 200)}|${Math.round(w * 200)}|${R.toFixed(2)}|${o.x.toFixed(2)},${o.z.toFixed(2)}|${m ? `${m[12].toFixed(3)},${m[13].toFixed(3)},${m[14].toFixed(3)},${m[0].toFixed(4)},${m[2].toFixed(4)}` : ''}`;
    this.grid.show(L, u, w, R, key, at);
  }

  // ------------------------------------------------------------------ where it goes

  /** where the line of sight would take it: a vehicle's place for things it lands in, a surface it meets, else straight down from where it floats */
  private findAim(h: Thing, box: Box3, eye: THREE.Vector3, dir: THREE.Vector3): void {
    const ctx = this.ctx!;
    const a = this.aim;
    a.stow = null;
    a.tryStow = null;
    a.on = null;
    a.surface = false;
    a.onSurface = false;
    a.slot = null;
    a.partSlot = null;
    a.put = null;
    a.under = null;
    const o = ctx.core.origin;
    // (where the line of sight meets a vehicle first, once a frame: what it may go on or in, how far it may float)
    this.losHit(eye, dir, Math.max(PLACE.surfaceReach, this.range.max) + 0.5);
    if (this.slotAim(h)) return;
    if (h.kind === 'part' && this.partSlotAim(eye, dir)) return;
    // a vehicle's place for things it lands in (not one behind the vehicle's own wall)
    const nearV: ModVehicle[] = [];
    for (const v of ctx.vehicles) if ((v.sim.px - (eye.x + o.x)) ** 2 + (v.sim.pz - (eye.z + o.z)) ** 2 <= 64) nearV.push(v);
    const inside = ctx.player.aboard?.v ?? null;
    // a board of a piece of furniture the line of sight goes into (a bookshelf's, an open cupboard's — not through a
    // vehicle's own wall): there, on that board. A piece of furniture itself goes on no board.
    const board = !this.forced && ctx.loose.boards && !(h.kind === 'item' && itemDef(h.item.item).cat === 'furniture') ? ctx.loose.boards(eye, dir, box, this.poseYaw(), this.gridOn, PLACE.surfaceReach) : null;
    if (board && board.dist <= this.los.dist) {
      const on = ctx.vehicles.find((v) => v === board.on) ?? null;
      a.on = on;
      a.surface = true;
      a.onSurface = true;
      a.x = board.x;
      a.y = board.y;
      a.z = board.z;
      a.ok = board.ok;
      a.why = board.why;
      a.put = board.put ?? null;
      this.gf = this.frameAt(board.x, board.z, on);
      return;
    }
    // (the harness may say where the line of sight comes down in a vehicle's place: the rest is as the game has it)
    const L = this.forced ?? (nearV.length ? ctx.cargo.landing(nearV, this.ray, h, PLACE.planeReach, inside, this.los.dist) : null);
    if (L && 'spot' in L) {
      // (a living space's wall: hung there, as the stowing hangs it)
      a.stow = L;
      a.ok = !!L.spot;
      a.why = L.spot ? '' : '放不下';
      a.surface = true;
      this.gf = this.frameOf(L.v);
      return;
    }
    if (L && zoneLidless(L.v.view.frame.id, L.zone, L.v.build)) {
      // (a boot without its lid: nothing stays in it — said where the thing would have gone)
      a.stow = { v: L.v, zone: L.zone, spot: null, why: LIDLESS_WHY, dist: L.dist };
      a.tryStow = null;
      a.ok = false;
      a.why = LIDLESS_WHY;
      a.surface = true;
      this.gf = this.frameOf(L.v, L.zone);
      return;
    }
    if (L) {
      const fr = this.frameOf(L.v, L.zone);
      this.gf = fr;
      // (a piece of furniture come into a room: onto its squares, its back to the nearest wall — once; Q and E turn it on)
      const room = L.zone.walls && h.kind === 'item' && itemDef(h.item.item).cat === 'furniture';
      const key = room ? `${L.v.build.uid}:${L.zone.id}` : '';
      if (room && key !== this.backedIn) {
        this.backedIn = key;
        const z = L.zone;
        // (its back — the side its −x faces — to the wall nearest the point looked at: turned so in the model's frame)
        const walls: [number, number][] = [
          [L.x - z.x[0], 0],
          [z.x[1] - L.x, Math.PI],
          [L.z - z.z[0], -Math.PI / 2],
          [z.z[1] - L.z, Math.PI / 2],
        ];
        const nearest = walls.reduce((p, q) => (q[0] < p[0] ? q : p));
        this.yaw = fr.yaw - nearest[1];
        this.turnT = 1;
        this.gridOn = true;
        this.facing = false;
      }
      // its turn in the vehicle's model (as three turns things); its footprint's middle on the point looked at
      const sy = fr.yaw - this.poseYaw();
      const cx = (box.minX + box.maxX) / 2;
      const cz = (box.minZ + box.maxZ) / 2;
      const c = Math.cos(sy);
      const s = Math.sin(sy);
      let x = L.x - (cx * c + cz * s);
      let z = L.z - (-cx * s + cz * c);
      // (where it is held, before the squares take it: what it goes against is by this)
      const heldX = x;
      const heldZ = z;
      if (this.gridOn) {
        const q = zoneFootprint(box, x, z, sy);
        const { du, dw } = latticeShift(
          q.map((p) => p[0] - fr.ox),
          q.map((p) => p[1] - fr.oz),
          PLACE.cell,
        );
        x += du;
        z += dw;
      }
      if (room) ({ x, z } = this.againstWalls(box, heldX, heldZ, x, z, sy, L.zone, ctx.cargo.placedIn(L.v, L.zone.id)));
      const y = ctx.cargo.restIn(L.v, L.zone, h, x, z, sy);
      const floor = gridAt(ctx.cargo.grid(L.v, L.zone), L.x, L.z);
      a.stow = { v: L.v, zone: L.zone, spot: y === null ? null : { x, y, z, yaw: sy }, why: y === null ? '放不下' : '', dist: L.dist };
      a.tryStow = y === null ? { x, y: (Number.isNaN(floor) ? 0 : floor) - box.minY, z, yaw: sy } : null;
      a.ok = y !== null;
      a.why = y === null ? '放不下' : '';
      a.surface = true;
      return;
    }
    // the surface the line of sight meets: there it goes, its box's lowest point on it
    const hit = this.surfaceHit(eye, dir, PLACE.surfaceReach);
    if (hit) {
      // (its footprint's middle on the point looked at; the highest of five points under it, so no corner sinks)
      const y0 = this.poseYaw();
      const cx0 = (box.minX + box.maxX) / 2;
      const cz0 = (box.minZ + box.maxZ) / 2;
      const c0 = Math.cos(y0);
      const s0 = Math.sin(y0);
      let bx = hit.x - (cx0 * c0 - cz0 * s0);
      let bz = hit.z - (cx0 * s0 + cz0 * c0);
      const fr = this.frameAt(hit.x, hit.z, hit.v);
      this.gf = fr;
      if (this.gridOn) ({ x: bx, z: bz } = this.snapWorld(box, bx, bz, hit.y, fr));
      const foot = footprint(box, bx, bz, y0);
      let top = -Infinity;
      let on: ModVehicle | null = null;
      const from = hit.y + 0.3;
      for (const [u, w] of [
        [0, 0],
        [0.98, 0.98],
        [-0.98, 0.98],
        [0.98, -0.98],
        [-0.98, -0.98],
      ]) {
        const fc = Math.cos(foot.yaw);
        const fs = Math.sin(foot.yaw);
        const px = foot.x + u * foot.hx * fc - w * foot.hz * fs;
        const pz = foot.z + u * foot.hx * fs + w * foot.hz * fc;
        const ls = ctx.loose.surfaceAt(px, pz, from);
        if (ls !== null && ls > top) {
          top = ls;
          on = null;
        }
        for (const v of nearV) {
          const vs = v.surfaceAt(px, pz, from);
          if (vs !== null && vs > top) {
            top = vs;
            on = v;
          }
        }
      }
      // (on a thing lying about: on its top, where the line of sight met it, riding with whatever that rides)
      if (hit.under && hit.y >= top) {
        top = hit.y;
        on = hit.v;
        a.under = hit.under;
      }
      if (top > -Infinity && top <= hit.y + 0.3) {
        a.on = on;
        a.surface = true;
        a.onSurface = true;
        a.x = bx;
        a.z = bz;
        a.y = top - box.minY + 0.002;
        a.why = this.blocked(box, a.x, a.y, a.z, on);
        a.ok = !a.why;
        return;
      }
    }
    // free: floating where the eye looks, kept short of a wall; its ghost straight down from its middle
    const p = this.p.copy(dir).multiplyScalar(this.d).add(eye);
    this.keepShort(p, eye, dir);
    const wx = p.x + o.x;
    const wy = p.y + o.y;
    const wz = p.z + o.z;
    let land = ctx.loose.surfaceAt(wx, wz, wy) ?? -Infinity;
    let on: ModVehicle | null = null;
    for (const v of nearV) {
      const s = v.surfaceAt(wx, wz, wy);
      if (s !== null && s > land) {
        land = s;
        on = v;
      }
    }
    // (or the top of a thing lying about under it)
    const lt = ctx.loose.topUnder(wx, wz, wy);
    if (lt && lt.y > land) {
      land = lt.y;
      a.under = lt.l;
      on = lt.l.riding?.on ? (ctx.vehicles.find((v) => v === lt.l.riding!.on) ?? null) : null;
    }
    a.on = on;
    this.gf = this.frameAt(wx, wz, on);
    if (!(land > -Infinity) || wy - land > PLACE.dropMax) {
      a.ok = false;
      a.why = '太远了';
      return;
    }
    // (a floor, a bench, a thing's top — not the bare ground, which as it is drawn is a few centimetres off the land's own height)
    const ground = ctx.world ? ctx.world.heightAt(wx, wz) : land;
    a.surface = !!on || (!!lt && lt.y >= land) || land > ground + 0.12;
    // its base where its lowest point touches what is under it
    const y = land - box.minY;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    // (the floating middle is over the ghost's middle: its base under it, off by the box's own middle turned)
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    a.x = wx - (cx * c - cz * s);
    a.z = wz - (cx * s + cz * c);
    a.y = y;
    a.why = this.blocked(box, a.x, a.y, a.z, on);
    a.ok = !a.why;
  }

  /** magnetic snap onto a compatible empty vehicle mount while placing a car part */
  private partSlotAim(eye: THREE.Vector3, dir: THREE.Vector3): boolean {
    const ctx = this.ctx!;
    if (this.forced) return false;
    const hit = ctx.player.ghosts.castShown(eye, dir, PLACE.surfaceReach, 0.14);
    if (!hit) return false;
    const slot = ctx.player.ghostSlot(hit.key);
    if (!slot || !slot.empty || Math.abs(slot.v.sim.kmh) > 1.5 || slot.v.view.shutOver(slot.mount.id)) return false;
    ctx.player.ghosts.selected = hit.key;
    const a = this.aim;
    a.partSlot = { v: slot.v, mount: slot.mount, sub: slot.sub, key: hit.key };
    a.ok = true;
    a.why = '';
    a.surface = true;
    a.onSurface = true;
    this.gf = this.frameOf(slot.v);
    return true;
  }

  /**
   * A slot of a system's the line of sight meets before anything of a vehicle's (slots.ts: a stove's burner, for a pan
   * or a pot): it goes onto its middle, its heading kept as it is held, Q and E turning it on the slot's own squares
   * (true: aimed there). Not where the harness says where it lands.
   */
  private slotAim(h: Thing): boolean {
    const ctx = this.ctx!;
    if (this.forced) return false;
    let best: SlotAim | null = null;
    for (const s of placeSlots(ctx)) {
      const sa = s.aim(h, this.ray, PLACE.surfaceReach);
      if (sa && sa.dist <= this.los.dist + 0.05 && (!best || sa.dist < best.dist)) best = sa;
    }
    if (!best) return false;
    const a = this.aim;
    const o = ctx.core.origin;
    a.slot = best;
    a.ok = true;
    a.why = '';
    a.surface = true;
    a.onSurface = true;
    a.x = best.pos.x + o.x;
    a.y = best.pos.y + o.y;
    a.z = best.pos.z + o.z;
    this.gf = { v: null, yaw: best.yaw, ox: 0, oz: 0 };
    return true;
  }

  /**
   * The first surface the line of sight (render space) comes down onto within far (world point; the vehicle it is on,
   * if one): the ground, a floor, a bench, a vehicle's roof or bed — where it meets what is under it; a wall it meets
   * first ends it (null). The vehicles by one ray each over their own shapes (losHit, CarView.castShown), the world by
   * its surface stepped along as far as that: a vehicle's own surface stepped along took a whole ray over its every face
   * each 4 cm, 86 ms a frame at a motorhome's bumper (docs/V3/plan/prompts.md §一).
   */
  private surfaceHit(eye: THREE.Vector3, dir: THREE.Vector3, far: number): { x: number; y: number; z: number; v: ModVehicle | null; under?: Loose | null } | null {
    const ctx = this.ctx!;
    const o = ctx.core.origin;
    const los = this.los;
    const until = Math.min(far, los.dist);
    const near = this.near;
    near.length = 0;
    ctx.player.walker.solids.solidsNear(eye.x + o.x, eye.z + o.z, far + 0.5, near);
    const step = 0.04;
    for (let s = 0.3; s <= until; s += step) {
      const x = eye.x + dir.x * s + o.x;
      const y = eye.y + dir.y * s + o.y;
      const z = eye.z + dir.z * s + o.z;
      // (into a wall: no surface this way)
      for (const b of near) {
        if (b.floor && y >= b.y1 - 0.02) continue;
        if (pointInBlock(x, y, z, b) && !(y >= b.y1 - 0.03)) return null;
      }
      // (the ground, a floor; or the top of a thing lying about — a chest's lid, a table's top: things stack, as Nomad Drive's do)
      let top = ctx.loose.surfaceAt(x, z, y + step);
      let under: Loose | null = null;
      const t = ctx.loose.topUnder(x, z, y + step);
      if (t && t.y > top) {
        top = t.y;
        under = t.l;
      }
      if (y <= top + 0.005) return { x, y: top, z, v: under?.riding?.on ? (ctx.vehicles.find((v) => v === under!.riding!.on) ?? null) : null, under };
    }
    // what of a vehicle the line of sight met first: a face turned up is a surface to put it on, its side a wall
    if (los.dist <= far && los.up) return { x: los.x, y: los.y, z: los.z, v: los.v };
    return null;
  }

  /** where the line of sight first meets a vehicle near (world point, how far, whether that face is turned up): found once a frame */
  private readonly los = { dist: Infinity, x: 0, y: 0, z: 0, up: false, v: null as ModVehicle | null };
  private losHit(eye: THREE.Vector3, dir: THREE.Vector3, far: number): void {
    const ctx = this.ctx!;
    const o = ctx.core.origin;
    const los = this.los;
    los.dist = Infinity;
    los.v = null;
    for (const v of ctx.vehicles) {
      const reach = far + v.sim.spec.body.halfLength + 1;
      if ((v.sim.px - (eye.x + o.x)) ** 2 + (v.sim.pz - (eye.z + o.z)) ** 2 > reach * reach) continue;
      const h = v.view.castShown(eye, dir, Math.min(far, los.dist));
      if (!h || h.dist >= los.dist) continue;
      los.dist = h.dist;
      los.x = h.point.x + o.x;
      los.y = h.point.y + o.y;
      los.z = h.point.z + o.z;
      los.up = h.normal.y >= 0.55;
      los.v = v;
    }
  }

  /** kept 5 cm short of a wall the line of sight meets on its way out (the solids round one: a building's walls, a prop; a vehicle's side) */
  private keepShort(p: THREE.Vector3, eye: THREE.Vector3, dir: THREE.Vector3): void {
    const ctx = this.ctx!;
    const o = ctx.core.origin;
    let d = p.distanceTo(eye);
    // (a vehicle in the way: short of where the line of sight meets it)
    if (this.los.dist < d + PLACE.wallGap) {
      d = Math.max(0.15, this.los.dist - PLACE.wallGap);
      p.copy(dir).multiplyScalar(d).add(eye);
    }
    const near = this.near;
    near.length = 0;
    ctx.player.walker.solids.solidsNear(eye.x + o.x, eye.z + o.z, d + 0.5, near);
    if (!near.length) return;
    for (let s = 0.15; s <= d; s += 0.05) {
      const x = eye.x + dir.x * s + o.x;
      const y = eye.y + dir.y * s + o.y;
      const z = eye.z + dir.z * s + o.z;
      for (const b of near) {
        if (b.floor && y >= b.y1 - 0.02) continue;
        if (pointInBlock(x, y, z, b)) {
          p.copy(dir).multiplyScalar(Math.max(0.15, s - PLACE.wallGap)).add(eye);
          return;
        }
      }
    }
  }

  /** what is in the way of it put down with its base at (x, y, z) (world): '挡住了', or '' nothing */
  private blocked(box: Box3, x: number, y: number, z: number, on: ModVehicle | null): string {
    const ctx = this.ctx!;
    const foot = footprint(box, x, z, this.poseYaw());
    const top = y + (box.maxY - box.minY);
    const r = Math.hypot(foot.hx, foot.hz) + 0.5;
    // the solids: walls, props (what it stands on is not in the way)
    const near = this.near;
    near.length = 0;
    ctx.player.walker.solids.solidsNear(foot.x, foot.z, r, near);
    if (firstBlocking(foot, y, top, near)) return '挡住了';
    // oneself
    const w = ctx.player.walker;
    if (w.y < top && w.y + 1.8 * PLACE.playerScale > y && circleInRect(w.x, w.z, 0.3 * PLACE.playerScale, foot)) return '挡住了';
    // a vehicle's body (unless it is what it lands on)
    for (const v of ctx.vehicles) {
      if (v === on) continue;
      const bd = v.sim.spec.body;
      const hd = headingOf(v, this.b9);
      const vr: Rect = { x: v.sim.px + Math.cos(hd) * bd.centerX, z: v.sim.pz + Math.sin(hd) * bd.centerX, hx: bd.halfLength, hz: bd.halfWidth, yaw: hd };
      if (Math.hypot(vr.x - foot.x, vr.z - foot.z) > bd.halfLength + r) continue;
      const vy = v.sim.py;
      if (vy + bd.top > y && vy + bd.bottom < top && firstBlocking(foot, y, top, [{ ...vr, y0: vy + bd.bottom, y1: vy + bd.top }])) return '挡住了';
    }
    // the other things lying about (what it stands on is not in the way: the one its middle is over, whose top is under it)
    for (const l of ctx.loose.list) {
      if (Math.hypot(l.x - foot.x, l.z - foot.z) > r + 1.5) continue;
      const lb = l.box ?? ctx.cargo.boxOf(heldOf(l));
      if (!lb) continue;
      const lr = footprint(lb, l.x, l.z, l.yaw);
      const ly0 = l.y + lb.minY;
      const ly1 = l.y + lb.maxY;
      if (ly1 <= y + 0.03 || ly0 >= top - 0.01) continue;
      if (circleInRect(x, z, 0.01, lr) && ly1 >= y - 0.05 && ly0 < y) continue;
      if (firstBlocking(foot, y, top, [{ ...lr, y0: ly0, y1: ly1 }])) return '挡住了';
    }
    return '';
  }

  /** its ghost where it comes down (floating), or where it would go and may not (red), with a dashed line from where it floats */
  private showGhost(h: Thing, box: Box3, centre: THREE.Vector3): void {
    const ctx = this.ctx!;
    const a = this.aim;
    const free = !a.stow && Number.isFinite(a.y) && a.why !== '太远了' && (!a.onSurface || !a.ok);
    const stowBlocked = !!(a.stow && !a.stow.spot && a.tryStow);
    const key = `${h.kind}:${h.kind === 'item' ? h.item.uid : h.kind === 'part' ? h.inst.uid : h.tool.uid}`;
    if (!this.ghost || this.ghost.key !== key) {
      this.ghost?.group.removeFromParent();
      const group = new THREE.Group();
      group.name = 'ghost:nd-place';
      group.visible = false;
      ctx.core.scene.add(group);
      const g = { key, group, kind: 'replace' as GhostKind };
      this.ghost = g;
      const token = ++this.ghostToken;
      void ctx.loose.objectFor(h).then((obj) => {
        if (this.ghostToken !== token || this.ghost !== g) return;
        applyGhost(obj, g.kind, true);
        group.add(obj);
      });
    }
    const g = this.ghost;
    const kind: GhostKind = !a.ok ? 'blocked' : a.surface ? 'empty' : 'replace';
    if (kind !== g.kind && g.group.children[0]) applyGhost(g.group.children[0], kind, kind !== 'replace');
    g.kind = kind;
    g.group.visible = free || stowBlocked;
    if (!this.line) {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
      this.line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xbfe9ff, dashSize: 0.06, gapSize: 0.05, transparent: true, opacity: 0.7, depthWrite: false }));
      this.line.name = 'nd:place-line';
      this.line.renderOrder = 23;
      ctx.core.scene.add(this.line);
    }
    this.line.visible = free && !a.onSurface;
    if (stowBlocked) {
      // (red where it would go in the vehicle: the spot it does not fit)
      const sp = a.tryStow!;
      const model = a.stow!.v.view.model;
      model.updateMatrixWorld(true);
      this.m4.makeRotationY(sp.yaw).setPosition(sp.x, sp.y, sp.z).premultiply(model.matrixWorld);
      this.m4.decompose(g.group.position, g.group.quaternion, this.tp2);
      g.group.scale.set(1, 1, 1);
      return;
    }
    if (!free) return;
    const o = ctx.core.origin;
    g.group.position.set(a.x - o.x, a.y - o.y, a.z - o.z);
    g.group.quaternion.setFromAxisAngle(UP, -this.poseYaw());
    // the line: from the floating middle down to the ghost's
    const gc = this.p.copy(centre).applyQuaternion(g.group.quaternion).add(g.group.position);
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, this.shownP.x, this.shownP.y, this.shownP.z);
    pos.setXYZ(1, gc.x, gc.y, gc.z);
    pos.needsUpdate = true;
    this.line.geometry.computeBoundingSphere();
    this.line.computeLineDistances();
    (this.line.material as THREE.LineDashedMaterial).color.set(a.ok ? 0xbfe9ff : 0xff8a6a);
  }

  /** the left button: put it down where it shows, if it may go there; where it may not, why — once, for a moment */
  private put(): void {
    const ctx = this.ctx!;
    const h = this.thing;
    const a = this.aim;
    if (!h) return;
    if (!a.ok) {
      ctx.ui.items.showDone(a.why || '放不下', 1.5);
      return;
    }
    const pl = ctx.player;
    const i = pl.slots.indexOf(h);
    if (i < 0) return this.stop();
    if (a.partSlot) {
      if (!pl.installFromPlace(a.partSlot.v, a.partSlot.mount, a.partSlot.sub)) {
        ctx.ui.items.showDone('装不上', 1.5);
        return;
      }
      this.placed++;
      this.stop();
      return;
    }
    if (a.slot) {
      // (onto the slot, turned as it is shown: the slot's system takes it out of the hands)
      if (!a.slot.put(turnOnSlot(this.poseYaw(), a.slot.yaw))) {
        ctx.ui.items.showDone('放不下', 1.5);
        return;
      }
      this.placed++;
      this.stop();
      return;
    }
    // (into an open container: it takes the thing as what it holds — all of it, or what its weight allows)
    if (a.put) {
      const left = a.put(h);
      if (left < 0) return;
      if (left === 0) pl.slots[i] = null;
      this.placed++;
      this.stop();
      return;
    }
    let l: Loose;
    const yaw = this.poseYaw();
    if (a.stow?.spot) {
      l = ctx.cargo.stow(a.stow.v, a.stow.zone, a.stow.spot, h);
      pl.slots[i] = null;
    } else {
      pl.slots[i] = null;
      l = h.kind === 'part' ? ctx.loose.addPart(h.inst, a.x, a.y, a.z, yaw) : h.kind === 'item' ? ctx.loose.addItem(h.item, a.x, a.y, a.z, yaw) : ctx.loose.addTool(h.tool, a.x, a.y, a.z, yaw);
      if (a.on) ctx.loose.ride(l, a.on);
      else if (a.onSurface) ctx.loose.rest(l);
      else ctx.loose.drop(l);
      // (put on a thing lying about: it lies on it — taken away, this comes down — and a place's table is one's own from then on)
      if (a.under && (a.on || a.onSurface)) {
        l.under = a.under;
        ctx.loose.touch(a.under);
      }
    }
    this.placed++;
    this.pops.push({ l, t: 0 });
    ctx.sound('putdown', massOf(h));
    this.stop();
  }

  lateUpdate(dt: number): void {
    // the things just put down: from 0.94 of their size to all of it, a little past it and back
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const pp = this.pops[i];
      pp.t += dt;
      const k = pp.t >= PLACE.popS ? 1 : outBack(pp.t / PLACE.popS);
      pp.l.obj.scale.setScalar(PLACE.popFrom + (1 - PLACE.popFrom) * k);
      if (pp.t >= PLACE.popS) this.pops.splice(i, 1);
    }
  }

  telemetry(): Record<string, unknown> {
    const a = this.aim;
    return { placing: !!this.thing, d: +this.d.toFixed(2), yaw: +this.yaw.toFixed(3), grid: this.gridOn, frame: this.gf.v ? this.gf.v.view.frame.id : 'world', ok: a.ok, why: a.why, into: a.stow ? `${a.stow.zone.id}` : a.slot ? 'slot' : null, placed: this.placed };
  }

  readonly harness = {
    /** R: hold out what is in the hands (true: placing now) */
    start: (): boolean => {
      if (!this.thing) this.toggle();
      return !!this.thing;
    },
    stop: (): void => this.stop(),
    /** Q (−1) or E (+1) */
    turn: (dir: 1 | -1): void => this.turnStep(dir),
    /** on the grid now (Q or E since it came out, the right button's turn not since) */
    grid: (): boolean => this.gridOn,
    /** the grid it is on: whose, its heading, its lattice's origin (a vehicle's model x and z) */
    frame: (): { v: string | null; yaw: number; ox: number; oz: number } => ({ v: this.gf.v ? this.gf.v.view.frame.id : null, yaw: this.gf.yaw, ox: this.gf.ox, oz: this.gf.oz }),
    /** the wheel, notches out (+) or in */
    wheel: (n: number): number => {
      this.d = stepDistance(this.d, n, this.range);
      return this.d;
    },
    /** the thing turned to a heading at once (as the right button would: off the grid) */
    yaw: (y: number): void => {
      this.yaw = y;
      this.facing = false;
      this.turnT = 1;
      this.gridOn = false;
    },
    /** where it would go now (onto a slot — a burner — into 'slot', turned on it so: rad about its up) */
    aim: (): { ok: boolean; why: string; into: string | null; x: number; y: number; z: number; surface: boolean; on: boolean; spot: Spot | null; turn: number | null } => ({
      ok: this.aim.ok,
      why: this.aim.why,
      into: this.aim.stow ? this.aim.stow.zone.id : this.aim.slot ? 'slot' : null,
      x: this.aim.x,
      y: this.aim.y,
      z: this.aim.z,
      surface: this.aim.surface,
      on: !!this.aim.on,
      spot: this.aim.stow?.spot ?? null,
      turn: this.aim.slot ? turnOnSlot(this.poseYaw(), this.aim.slot.yaw) : null,
    }),
    /** the left button */
    put: (): boolean => {
      const n = this.placed;
      this.put();
      return this.placed > n;
    },
    placing: (): boolean => !!this.thing,
    /** the thing held out lands at a point (model x, z) of a place of a vehicle, whatever the view looks at (null: as the game has it) */
    landAt: (vi: number | null, zoneId = '', x = 0, z = 0): boolean => {
      const v = vi === null ? null : (this.ctx?.vehicles[vi] ?? null);
      const zone = v ? zonesFor(v.view.frame.id, v.build).find((q) => q.id === zoneId) : null;
      this.forced = v && zone ? { v, zone, x, z, dist: 1 } : null;
      return !!this.forced;
    },
    /** the grid drawn now */
    gridShown: (): boolean => !!this.grid?.mesh.visible,
  };
}
