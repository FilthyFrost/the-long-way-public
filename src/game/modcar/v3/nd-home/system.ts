/**
 * The ND furniture in the game (docs/ND/PLAN.md; the kinds: core/v3/nd/items.ts, the models: tools/blender/items/
 * nd_home.py): each piece lying about — in a prefab building, by the road, in a vehicle — offers its doors and
 * drawers to the mark as devices of their own (E swings a door open on its hinge or shut, pulls a drawer out or
 * pushes it in), and itself as one more a little further off than they are (E picks it up, F held as well), so a
 * big piece's coarse sphere never takes the mark from what is on it or in front of it; a piece one looks into (a
 * cupboard with its door open, a bookshelf, a fridge) by what of it the line of sight meets, so what stands in it is
 * nearer than its back. A fridge's door open, or a nightstand's drawer pulled out, what is in it is seen standing in it
 * and taken out by the mark on it, no list coming up (the player's ask, 2026-11-26: v3/nd-store); Tab lists it as any
 * box's. Which doors stand open is kept on the piece itself (ItemState.open), so it is saved with it, and a door left
 * open stands open when the piece comes in again. Things put down over a piece land on it — a table's top, a counter,
 * a bookshelf's shelves and its top, a fridge's top, a chair's or a sofa's seat — as Nomad Drive's furniture has its
 * surfaces to set things on.
 *
 * As Nomad Drive has it (docs/ND/PLAN.md, ND4): a chair is picked up at a press, a big piece (a sofa, a table, a
 * bookshelf, a fridge, a cupboard) standing in a vehicle with E held half a second; a chair's seat and a sofa's
 * two are devices of their own that sit one down (sit.ts).
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { itemDef, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import { ND_BOOKSHELF, ND_CABINET, ND_CHAIR, ND_CHAIR_FOLD, ND_DINNER_CHAIR, ND_DINNER_TABLE, ND_FRIDGE, ND_KITCHEN_STAND, ND_NIGHTSTAND, ND_PEGBOARD, ND_ROD_RACK, ND_SOFA, ND_SOFA_2, ND_STOOL, ND_TABLE, ND_TOP_CABINET, ND_WALL_SHELF, ND_WC, ND_WORKBENCH } from '../../../../core/v3/nd/items';
import { fitSub, newInstance } from '../../../../core/modcar/build';
import { RECIPES, recipeOpen, shortOf, spend, type Makes, type Recipe, type Stock } from '../../../../core/modcar/crafting';
import { MATERIAL_IDS, MATERIALS, newItem } from '../../../../core/modcar/items';
import { newTool } from '../../../../core/modcar/tools';
import { intoHands, type ListSource } from '../../listSources';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { openList } from '../../listSources';
import type { BoardAim, Loose } from '../../loose';
import { heldOf, type Held } from '../../player';
import { boxHit, FaceTheHand, meshHit, modelOf, type PartBox } from '../../nd/kit';
import { massOf } from '../../cargo';
import type { PartInstance } from '../../../../core/modcar/types';
import type { Tool } from '../../../../core/modcar/tools';
import { boardsOf } from '../../../../core/v3/nd/store';
import { HANGS, LEDGE_Y, PEGS, pegFor, RACK, RACK_OUT, roomAt, roomShut, roomsOf, spotIn, type Room, type Standing } from './rooms';
import { SEATS, SIT_WORD, Sitting } from './sit';

/**
 * What a making gives, as a thing in the hands (the workshop's heldOfMakes: written out here, for the workshop's own
 * file brings the whole of its bench — its models, its smoke, its page — into every module that reads this one)
 */
function heldOfMakes(m: Makes): NonNullable<Held> {
  if (m.kind === 'tool') return { kind: 'tool', tool: newTool(m.tool, { ...(m.tier ? { tier: m.tier } : {}), ...(m.fuel ? { fuel: m.fuel, litres: 0 } : {}), ...(m.colour !== undefined ? { colour: m.colour } : {}) }) };
  if (m.kind === 'item') return { kind: 'item', item: newItem(m.item) };
  const inst = newInstance(m.part, { charge: 1 });
  if (m.tire) fitSub(inst, 'tire', newInstance(m.tire));
  return { kind: 'part', inst };
}

/** the stow of a thing hung on a tool board or lying across a rod rack (Loose.stow): on a wall, by its piece */
const HUNG = 'wall';

/** a thing that stood in a piece of furniture, as the piece keeps it while it is carried: what it is, where in the piece's frame, turned how */
export interface Carried {
  part?: PartInstance;
  tool?: Tool;
  item?: ItemInstance;
  at: [number, number, number];
  yaw: number;
  lie?: 'z' | 'x';
  /** how it was turned in the piece's frame, when it hung on it or lay across it (a tool on the board): its quaternion */
  q?: [number, number, number, number];
}

declare module '../../../../core/modcar/items' {
  interface ItemState {
    /** the doors and drawers of a piece of furniture standing open (their names) */
    open?: string[];
    /** what stood in a piece of furniture when it was taken up: it goes where the piece goes, and stands in it again when it is put down */
    carried?: Carried[];
  }
}

/**
 * A piece taken up with things in it carries them along while they weigh no more than this together (kg); over it,
 * 先拿走里面的东西 (docs/V3/plan/finish.md §十一 2)
 */
export const CARRY_WITH_KG = 12;

const T = (zh: string, en: string): Text => ({ zh, en });

const FURNITURE = new Set([ND_TABLE, ND_CHAIR, ND_SOFA, ND_BOOKSHELF, ND_FRIDGE, ND_KITCHEN_STAND, ND_TOP_CABINET, ND_NIGHTSTAND, ND_CHAIR_FOLD, ND_DINNER_TABLE, ND_DINNER_CHAIR, ND_STOOL, ND_SOFA_2, ND_WC, ND_WALL_SHELF, ND_CABINET, ND_PEGBOARD, ND_ROD_RACK, ND_WORKBENCH]);
/** the van workbench: what a thing made on it draws on the vehicle's power (kW for so many seconds) */
const BENCH_KW = 0.5;
const BENCH_S = 180;
/** the big pieces: taken from where they stand in a vehicle with E held this long (Nomad Drive: on a placement surface, 0.5 s) */
const BIG = new Set([ND_TABLE, ND_SOFA, ND_BOOKSHELF, ND_FRIDGE, ND_KITCHEN_STAND, ND_TOP_CABINET, ND_NIGHTSTAND, ND_DINNER_TABLE, ND_SOFA_2, ND_WC, ND_WALL_SHELF, ND_CABINET, ND_PEGBOARD, ND_ROD_RACK, ND_WORKBENCH]);
const TAKE_HOLD_S = 0.5;
/** a door swings this far (rad), a drawer comes out this much of its depth; how quickly (s) */
const DOOR_OPEN = 1.85;
const DRAWER_OUT = 0.72;
const MOVE_S = 0.4;
/** the squares a thing placed on a board of a piece keeps to (m), from the board's back left corner */
const BOARD_CELL = 0.05;

const UP = new THREE.Vector3(0, 1, 0);

/** the heights things can be set down on, over a piece's footprint (its model's frame, m: tools/blender/items/nd_home.py) */
const SURFACES: Readonly<Record<string, readonly number[]>> = {
  [ND_TABLE]: [0.762],
  [ND_CHAIR]: [0.462],
  [ND_SOFA]: [0.445],
  [ND_BOOKSHELF]: [0.096, 0.451, 0.811, 1.171, 1.53],
  [ND_FRIDGE]: [1.36],
  [ND_KITCHEN_STAND]: [0.922],
  [ND_TOP_CABINET]: [0.63],
  [ND_NIGHTSTAND]: [0.31, 0.59],
  [ND_CHAIR_FOLD]: [0.44],
  [ND_DINNER_TABLE]: [0.664],
  [ND_DINNER_CHAIR]: [0.46],
  [ND_STOOL]: [0.585],
  [ND_SOFA_2]: [0.4],
  [ND_WC]: [0.425],
  [ND_WALL_SHELF]: [0.04, 0.32],
  [ND_CABINET]: [0.49, 0.915],
};

interface Mover {
  name: string;
  obj: THREE.Object3D;
  q0: THREE.Quaternion;
  p0: THREE.Vector3;
  /** its box in the piece's frame as it is shut; and in its own frame, where it is now (what the mark meets: an open door stands aside) */
  box: PartBox;
  own: PartBox;
  door: boolean;
  /** a door: which way it swings (±1); a drawer: how far it comes out (m) */
  turn: number;
  out: number;
  t: number;
  device: GarageDevice;
}

class Piece {
  movers: Mover[] = [];
  dressedFor: THREE.Object3D | null = null;
  body: GarageDevice;
  /** its seats (a chair's one, a sofa's two): each sits one down */
  seats: GarageDevice[];
  box: PartBox | null = null;
  constructor(
    readonly sys: NdHome,
    readonly l: Loose,
  ) {
    const self = this;
    this.body = {
      id: `nd-home:${l.uid}`,
      get x() {
        return l.x;
      },
      get y() {
        return l.y + l.mid;
      },
      get z() {
        return l.z;
      },
      get radius() {
        return l.radius;
      },
      get loose() {
        return l;
      },
      get word(): Text {
        return T(`拿起 <b>${itemDef(l.item!.item).name.zh}</b>`, 'Pick it up');
      },
      get card(): ItemCard {
        return itemCardKept(l.item!, itemNow(), self.sys.time);
      },
      alt: null,
      // (a big piece standing in a vehicle: E held)
      get holdS() {
        return BIG.has(l.item!.item) && l.riding ? TAKE_HOLD_S : undefined;
      },
      holding: () => {},
      use: () => self.sys.pickUp(self),
      hit: (ray, reach) => {
        const b = self.box ?? self.sys.boxOf(l);
        if (!b) return null;
        self.box = b;
        const d = boxHit(l.obj, ray, b, reach);
        if (d === null) return null;
        // (a piece things stand in — a cupboard, a bookshelf, a fridge — where the line of sight meets the piece
        // itself: what stands in it, in front of its back, is nearer; its doors and drawers first, where they are)
        if (self.inner) {
          const m = meshHit(modelOf(l), ray, reach);
          return m === null ? null : m + 0.1;
        }
        return d + 0.1;
      },
    };
    this.inner = roomsOf(l.item!.item).some((r) => !r.top) || boardsOf(l.item!.item).length > 0;
    this.seats = (SEATS[l.item!.item] ?? []).map((s, i): GarageDevice => ({
      id: `nd-home:${l.uid}:seat:${i}`,
      get x() {
        return l.x;
      },
      get y() {
        return l.y + s.hip[1];
      },
      get z() {
        return l.z;
      },
      radius: 0.3,
      get loose() {
        return l;
      },
      get word(): Text {
        return self.sys.seatWord();
      },
      get card(): ItemCard {
        return itemCardKept(l.item!, itemNow(), self.sys.time);
      },
      alt: null,
      use: () => self.sys.sitOn(self, i),
      hit: (ray, reach) => boxHit(l.obj, ray, s.box, reach),
    }));
  }
  get item(): ItemInstance {
    return this.l.item!;
  }
  /** a van workbench's top: the left button opens what one has learnt to make (null: it is no workbench) */
  bench: GarageDevice | null = null;
  /** things stand in it (rooms inside it, or a container's boards: core/v3/nd/store.ts): the mark goes into it */
  readonly inner: boolean;
}

export class NdHome implements System<GameContext>, InteractSource {
  readonly id = 'nd-home';
  readonly budget = { cpuMs: 0.2 };
  private ctx: GameContext | null = null;
  /** its own clock (s): the cards kept */
  time = 0;
  private readonly pieces = new Map<Loose, Piece>();
  private rev = -1;
  private readonly q = new THREE.Quaternion();
  private readonly facing = new FaceTheHand();
  private readonly b3 = new THREE.Box3();
  private readonly inv = new THREE.Matrix4();
  /** sitting on a chair or a sofa (sit.ts) */
  sit: Sitting | null = null;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.sit = new Sitting(ctx);
    // (Q with a thing in the hands, the mark on a piece: into it)
    ctx.player.shelver = { word: (t) => this.shelfWord(t), into: (t, held) => this.stowInto(t, held) };
    ctx.loose.keeper = (l) => this.keeperOf(l);
    ctx.loose.boards = (eye, dir, box, yaw, grid, reach) => this.boardAim(eye, dir, box, yaw, grid, reach);
    // (a thing put down over a piece of furniture lands on it, as on a floor)
    const base = ctx.loose.surfaceAt;
    ctx.loose.surfaceAt = (x, z, fromY) => {
      const g = base(x, z, fromY);
      const f = this.surfaceAt(x, z, fromY);
      return f > g ? f : g;
    };
  }

  /** the highest surface of a piece of furniture at (x, z) (world) not above fromY, −∞ none */
  surfaceAt(x: number, z: number, fromY: number): number {
    let top = -Infinity;
    for (const p of this.pieces.values()) {
      const l = p.l;
      if (l.riding || !l.resting) continue;
      const hs = SURFACES[p.item.item];
      const b = p.box ?? this.boxOf(l);
      if (!hs || !b) continue;
      p.box = b;
      // (into its frame: its object is turned by −yaw about the up axis, loose.ts)
      const dx = x - l.x;
      const dz = z - l.z;
      const c = Math.cos(l.yaw);
      const sn = Math.sin(l.yaw);
      const lx = c * dx + sn * dz;
      const lz = -sn * dx + c * dz;
      if (lx < b.min[0] || lx > b.max[0] || lz < b.min[2] || lz > b.max[2]) continue;
      for (const h of hs) {
        const y = l.y + h;
        if (y <= fromY + 0.05 && y > top) top = y;
      }
    }
    return top;
  }

  /** a piece's box in its own frame (its model as it lies), null while its model is not in */
  boxOf(l: Loose): PartBox | null {
    const tb = this.ctx?.cargo.boxOf?.(heldOf(l));
    if (!tb) return null;
    return { min: [tb.minX, tb.minY, tb.minZ], max: [tb.maxX, tb.maxY, tb.maxZ] };
  }

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      if (!l.item || !FURNITURE.has(l.item.item)) continue;
      seen.add(l);
      l.device = true;
      if (!this.pieces.has(l)) {
        this.facing.face(l, this.time);
        this.pieces.set(l, new Piece(this, l));
      }
    }
    for (const [l, p] of [...this.pieces]) {
      if (seen.has(l)) continue;
      if (p.movers.length) ctx.loose.keepApart(l.uid, false);
      this.pieces.delete(l);
    }
  }

  /** its doors and drawers found on its model as it came in: each a device of its own */
  private dress(p: Piece, model: THREE.Object3D): void {
    p.dressedFor = model;
    p.movers = [];
    const open = new Set(p.item.state?.open ?? []);
    model.updateWorldMatrix(true, true);
    this.inv.copy(model.matrixWorld).invert();
    model.traverse((o) => {
      // (the mover itself, not the meshes of its materials under it: P_door_a, not P_door_a_1)
      if (!/^P_(door|drawer)(_[a-z]+)?$/.test(o.name)) return;
      // its box in the model's frame, and where its hinge (its origin) is
      this.b3.makeEmpty();
      o.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(this.inv, m.matrixWorld));
        this.b3.union(bb);
      });
      if (this.b3.isEmpty()) return;
      const door = o.name.startsWith('P_door');
      const pivot = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(this.inv);
      const c = this.b3.getCenter(new THREE.Vector3());
      const name = o.name;
      // (its box in its own frame too: what the mark meets goes with it, an open door standing aside from what it shut in)
      const ownInv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const ob = new THREE.Box3();
      o.traverse((cm) => {
        const m = cm as THREE.Mesh;
        if (m.isMesh) ob.union(m.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(ownInv, m.matrixWorld)));
      });
      const mv: Mover = {
        name,
        obj: o,
        q0: o.quaternion.clone(),
        p0: o.position.clone(),
        box: { min: [this.b3.min.x - 0.01, this.b3.min.y, this.b3.min.z], max: [this.b3.max.x + 0.02, this.b3.max.y, this.b3.max.z] },
        own: { min: [ob.min.x - 0.01, ob.min.y, ob.min.z], max: [ob.max.x + 0.02, ob.max.y, ob.max.z] },
        door,
        // (the leaf runs from the hinge towards its middle: its free edge comes out towards the front, +x)
        turn: Math.sign(c.z - pivot.z) || 1,
        out: (this.b3.max.x - this.b3.min.x) * DRAWER_OUT,
        t: open.has(name) ? 1 : 0,
        device: null as unknown as GarageDevice,
      };
      const l = p.l;
      const self = this;
      // (a drawer or a door a container's boards ride on — a nightstand's drawer, a fridge's door with its shelves —
      // open: the mark meets it where the line of sight meets it itself, so what stands in it or on it is nearer than
      // its box; shut, its box, its front as it is)
      const carries = boardsOf(p.item.item).some((b) => b.on === name);
      mv.device = {
        id: `nd-home:${l.uid}:${name}`,
        get x() {
          return l.x;
        },
        get y() {
          return l.y + l.mid;
        },
        get z() {
          return l.z;
        },
        radius: 0.3,
        get loose() {
          return l;
        },
        get word(): Text {
          const isOpen = (p.item.state?.open ?? []).includes(name);
          const what = p.item.item === ND_FRIDGE ? '冰箱门' : '柜门';
          return door ? (isOpen ? T(`关上${what}`, 'Shut it') : T(`打开${what}`, 'Open it')) : isOpen ? T('推回抽屉', 'Push the drawer in') : T('拉开抽屉', 'Pull the drawer out');
        },
        get card(): ItemCard {
          return itemCardKept(l.item!, itemNow(), self.time);
        },
        alt: null,
        use: () => self.toggle(p, mv),
        hit: (ray, reach) => {
          const d = boxHit(mv.obj, ray, mv.own, reach);
          return d === null || !carries || mv.t === 0 ? d : meshHit(mv.obj, ray, reach);
        },
      };
      p.movers.push(mv);
      // (as it stands: a door left open stands open when the piece's model comes in again — a game gone on with)
      this.pose(mv);
    });
    if (p.movers.length) this.ctx?.loose.keepApart(p.l.uid, true);
    p.box = null;
  }

  /** a door swung, a drawer pulled out, as far as it has gone (mv.t: 0 shut … 1 open) */
  private pose(mv: Mover): void {
    const k = mv.t * mv.t * (3 - 2 * mv.t);
    if (mv.door) {
      this.q.setFromAxisAngle(UP, mv.turn * DOOR_OPEN * k);
      mv.obj.quaternion.copy(mv.q0).multiply(this.q);
    } else mv.obj.position.set(mv.p0.x + mv.out * k, mv.p0.y, mv.p0.z);
  }

  toggle(p: Piece, mv: Mover): void {
    const ctx = this.ctx!;
    const st = (p.item.state ??= {});
    const open = new Set(st.open ?? []);
    const now = !open.has(mv.name);
    if (now) open.add(mv.name);
    else open.delete(mv.name);
    if (open.size) st.open = [...open].sort();
    else delete st.open;
    this.doorRev++;
    ctx.loose.touch(p.l);
    ctx.sound(mv.door ? (now ? 'door_open' : 'door_house_close') : 'container_open', 0.4);
    // (a piece that holds things opened — a fridge's door, a nightstand's drawer: what is in it stands in it, v3/nd-store)
  }

  /** a van workbench's top as a device: the left button opens its list (a held press on the piece takes it up, as any big piece) */
  private benchDevice(p: Piece): GarageDevice {
    const l = p.l;
    const self = this;
    return {
      id: `nd-home:${l.uid}:bench`,
      get x() {
        return l.x;
      },
      get y() {
        return l.y + 0.9;
      },
      get z() {
        return l.z;
      },
      radius: 0.4,
      get loose() {
        return l;
      },
      get word(): Text {
        return T('打开工作台', 'Open the workbench');
      },
      get why(): Text | null {
        return self.benchWhy(p);
      },
      get card(): ItemCard {
        return itemCardKept(l.item!, itemNow(), self.time);
      },
      alt: null,
      use: () => {
        if (!self.benchWhy(p)) openList(self.benchList(p));
      },
      // (its top and what stands over it: the slab, the vice, the lamp)
      hit: (ray, reach) => boxHit(l.obj, ray, { min: [-0.3, 0.8, -0.58], max: [0.3, 1.0, 0.58] }, reach),
    };
  }

  private withinReach(l: Loose): boolean {
    const w = this.ctx?.player.walker;
    return !!w && Math.hypot(l.x - w.x, l.z - w.z) < 2.6;
  }

  pickUp(p: Piece): void {
    const ctx = this.ctx!;
    if (this.sit?.on) return void ctx.player.flashWhy('先起身');
    // what stands in it goes with it — when that is light enough to carry in it
    const inIt = this.contentsOf(p);
    const kg = inIt.reduce((a, t) => a + massOf(heldOf(t.l)), 0);
    if (kg > CARRY_WITH_KG) return void ctx.player.flashWhy('先拿走里面的东西');
    p.l.obj.updateMatrixWorld(true);
    const pq = p.l.obj.getWorldQuaternion(new THREE.Quaternion()).invert();
    const carried: Carried[] = inIt.map((t) => {
      const q = t.room < 0 ? pq.clone().multiply(t.l.obj.getWorldQuaternion(new THREE.Quaternion())) : null;
      return {
        ...(t.l.part ? { part: t.l.part } : t.l.tool ? { tool: t.l.tool } : { item: t.l.item! }),
        at: [t.lx, t.ly, t.lz] as [number, number, number],
        yaw: t.l.yaw - p.l.yaw,
        ...(t.l.lie ? { lie: t.l.lie } : {}),
        ...(q ? { q: [q.x, q.y, q.z, q.w] as [number, number, number, number] } : {}),
      };
    });
    const st = (p.item.state ??= {});
    if (carried.length) st.carried = carried;
    if (!ctx.player.takeLoose(p.l)) {
      delete st.carried;
      return void ctx.player.flashWhy('手满了');
    }
    for (const t of inIt) {
      this.hidden.delete(t.l);
      t.l.shut = false;
      ctx.loose.keepApart(t.l.uid, false);
      ctx.loose.remove(t.l);
    }
  }

  // ------------------------------------------------------------------ what stands in a piece (rooms.ts)

  private readonly v3 = new THREE.Vector3();
  private readonly v3b = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  /** the things not drawn: behind the shut doors of a piece (the piece they stand in) */
  private readonly hidden = new Map<Loose, Piece>();
  /** the piece each thing stands in, by name (as of keptRev) */
  private readonly kept = new Map<Loose, string>();
  private keptRev = -1;
  private hideRev = -1;
  /** goes up whenever a door or a drawer is opened or shut; the count the hiding last looked at */
  private doorRev = 0;
  private hideDoors = -1;

  /** a point of the world in a piece's own frame (its model's) */
  private toPiece(p: Piece, x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const o = this.ctx!.core.origin;
    p.l.obj.updateMatrixWorld();
    return p.l.obj.worldToLocal(out.set(x - o.x, y - o.y, z - o.z));
  }

  /**
   * What stands in a piece's rooms, each with where in the piece's frame and in which room: the things lying about
   * that ride what it rides (or lie about as it does), not furniture themselves.
   */
  contentsOf(p: Piece): { l: Loose; room: number; lx: number; ly: number; lz: number }[] {
    const ctx = this.ctx;
    const rooms = roomsOf(p.item.item);
    if (!ctx || (!rooms.length && !HANGS[p.item.item])) return [];
    const out: { l: Loose; room: number; lx: number; ly: number; lz: number }[] = [];
    const on = p.l.riding?.on ?? null;
    const hang = HANGS[p.item.item];
    for (const t of ctx.loose.list) {
      if (t === p.l || (t.item && FURNITURE.has(t.item.item)) || (t.riding?.on ?? null) !== on || (!t.resting && !t.riding)) continue;
      if (Math.abs(t.x - p.l.x) > 2 || Math.abs(t.z - p.l.z) > 2 || Math.abs(t.y - p.l.y) > 2.6) continue;
      const q = this.toPiece(p, t.x, t.y, t.z, this.v3);
      // (what hangs on a board or lies across a rack: within its box, no room's floor under it)
      if (hang) {
        if (t.stow === HUNG && q.x >= hang.lo[0] && q.x <= hang.hi[0] && q.y >= hang.lo[1] && q.y <= hang.hi[1] && q.z >= hang.lo[2] && q.z <= hang.hi[2]) out.push({ l: t, room: -1, lx: q.x, ly: q.y, lz: q.z });
        continue;
      }
      const room = roomAt(p.item.item, q.x, q.y, q.z);
      if (room >= 0) out.push({ l: t, room, lx: q.x, ly: q.y, lz: q.z });
    }
    return out;
  }

  /** a piece put down again with what it carried: each thing stands in it where it stood */
  private unstash(p: Piece): void {
    const ctx = this.ctx!;
    const list = p.item.state?.carried;
    if (!list?.length) return;
    delete p.item.state!.carried;
    const o = ctx.core.origin;
    p.l.obj.updateMatrixWorld(true);
    for (const c of list) {
      const w = p.l.obj.localToWorld(this.v3.set(c.at[0], c.at[1], c.at[2]));
      const x = w.x + o.x;
      const y = w.y + o.y;
      const z = w.z + o.z;
      const yaw = p.l.yaw + c.yaw;
      const t = c.part ? ctx.loose.addPart(c.part, x, y, z, yaw) : c.tool ? ctx.loose.addTool(c.tool, x, y, z, yaw) : c.item ? ctx.loose.addItem(c.item, x, y, z, yaw) : null;
      if (!t) continue;
      if (c.lie) t.lie = c.lie;
      // (what hung on it hangs on it again, turned as it was — where the piece hangs on a wall again; else it stands by it)
      const on = p.l.riding?.on;
      if (c.q && on) {
        const wq = p.l.obj.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion(c.q[0], c.q[1], c.q[2], c.q[3]));
        this.rideAt(t, on, w, wq);
        continue;
      }
      this.settle(p, t);
    }
    ctx.loose.touch(p.l);
  }

  /** a thing stood in a piece stays where it is: riding what the piece rides (in its zone), or at rest */
  private settle(p: Piece, t: Loose): void {
    const ctx = this.ctx!;
    const on = p.l.riding?.on;
    if (on) {
      ctx.loose.ride(t, on);
      t.stow = p.l.stow;
      const v = ctx.vehicles.find((x) => (x as unknown) === on);
      if (v) ctx.cargo.weigh(v);
    } else ctx.loose.rest(t);
    t.touched = true;
  }

  /** what Q would do with the thing in the hands, the mark on a piece that has rooms: its line (null: nothing) */
  private shelfWord(t: unknown): string | null {
    const p = this.pieceOfTarget(t);
    if (!p) return null;
    if (p.item.item === ND_PEGBOARD) return '挂到 <b>工具挂板</b> 上';
    if (p.item.item === ND_ROD_RACK) return '搁到 <b>鱼竿架</b> 上';
    return roomsOf(p.item.item).length ? `放进 <b>${itemDef(p.item.item).name.zh}</b>` : null;
  }

  /** a thing riding a carrier at a place and a turn of the world (render space): hung, not stood */
  private rideAt(t: Loose, on: NonNullable<Loose['riding']>['on'], world: THREE.Vector3, wq: THREE.Quaternion): void {
    const ctx = this.ctx!;
    on.frame.updateMatrixWorld(true);
    const pos = on.frame.worldToLocal(world.clone());
    const rot = on.frame.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(wq);
    ctx.loose.ride(t, on, { pos, rot });
    t.stow = HUNG;
    t.touched = true;
    const v = ctx.vehicles.find((x) => (x as unknown) === on);
    if (v) ctx.cargo.weigh(v);
  }

  /**
   * Q with a tool in the hands, the mark on the tool board (docs/V3/plan/finish.md §十一 2 工具挂板): it stands on the
   * board's ledge under its own hook — its long side up the wall, its thin side to it. Or with a rod, on the rod rack: across the first free
   * pair of rests. The board or the rack hung on a vehicle's wall: lying about, they hold nothing. True: the press is taken.
   */
  private hangOn(p: Piece, held: NonNullable<Held>): boolean {
    const ctx = this.ctx!;
    const on = p.l.riding?.on;
    const board = p.item.item === ND_PEGBOARD;
    if (!on) {
      ctx.player.flashWhy(board ? '先把挂板挂到车厢墙上' : '先把竿架挂到车厢墙上');
      return true;
    }
    const key = held.kind === 'tool' ? `tool:${held.tool.kind}` : held.kind === 'item' ? held.item.item : `part:${held.inst.part}`;
    const there = this.contentsOf(p);
    const keyOf = (l: Loose): string => (l.tool ? `tool:${l.tool.kind}` : l.item ? l.item.item : `part:${l.part?.part}`);
    const b = ctx.cargo.boxOf(held);
    if (!b) return true;
    const dims = [b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ];
    const long = dims.indexOf(Math.max(...dims));
    const m = new THREE.Matrix4();
    let at: THREE.Vector3;
    const corners = (mm: THREE.Matrix4): THREE.Box3 => {
      const bb = new THREE.Box3();
      for (const x of [b.minX, b.maxX]) for (const y of [b.minY, b.maxY]) for (const z of [b.minZ, b.maxZ]) bb.expandByPoint(this.v3.set(x, y, z).applyMatrix4(mm));
      return bb;
    };
    if (board) {
      const i = pegFor(key, there.map((c) => keyOf(c.l)));
      if (i < 0) {
        ctx.player.flashWhy(PEGS.some((g) => g.takes.includes(key)) ? '它的钩子上已经挂着东西' : '挂板上没有它的钩子');
        return true;
      }
      // its long side up the wall, then its thinner side out of the wall
      if (long === 0) m.makeRotationZ(Math.PI / 2);
      else if (long === 2) m.makeRotationX(-Math.PI / 2);
      let bb = corners(m);
      if (bb.max.x - bb.min.x > bb.max.z - bb.min.z) {
        m.premultiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        bb = corners(m);
      }
      const g = PEGS[i];
      // (standing on the board's ledge under its hook, its back on the board's face)
      at = new THREE.Vector3(0.008 - bb.min.x, LEDGE_Y - bb.min.y, g.z - (bb.min.z + bb.max.z) / 2);
    } else {
      if (!(held.kind === 'item' && itemDef(held.item.item).cat === 'rod')) {
        ctx.player.flashWhy('竿架上只搁鱼竿');
        return true;
      }
      // (which rests are taken: a rod lying within a hand's height of one)
      const free = RACK.findIndex((y) => !there.some((c) => Math.abs(c.ly - y) < 0.07));
      if (free < 0) {
        ctx.player.flashWhy('竿架搁满了');
        return true;
      }
      // its long side along the wall
      if (long === 0) m.makeRotationY(Math.PI / 2);
      else if (long === 1) m.makeRotationX(Math.PI / 2);
      const bb = corners(m);
      at = new THREE.Vector3(RACK_OUT - (bb.min.x + bb.max.x) / 2, RACK[free] - bb.min.y, -(bb.min.z + bb.max.z) / 2);
    }
    p.l.obj.updateMatrixWorld(true);
    const world = new THREE.Matrix4().multiplyMatrices(p.l.obj.matrixWorld, new THREE.Matrix4().makeTranslation(at.x, at.y, at.z).multiply(m));
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    world.decompose(wp, wq, new THREE.Vector3());
    const o = ctx.core.origin;
    const l = held.kind === 'part' ? ctx.loose.addPart(held.inst, wp.x + o.x, wp.y + o.y, wp.z + o.z, 0) : held.kind === 'tool' ? ctx.loose.addTool(held.tool, wp.x + o.x, wp.y + o.y, wp.z + o.z, 0) : ctx.loose.addItem(held.item, wp.x + o.x, wp.y + o.y, wp.z + o.z, 0);
    this.rideAt(l, on, wp, wq);
    ctx.player.held = null;
    ctx.sound('putdown', Math.min(1, massOf(held) / 6));
    return true;
  }

  // ------------------------------------------------------------------ the van workbench

  /** can the workbench work: riding in a vehicle with something to draw on (null), or why not */
  private benchWhy(p: Piece): Text | null {
    const v = this.ctx?.vehicles.find((x) => (x as unknown) === p.l.riding?.on);
    if (!v) return T('放进有电的车里才能用', 'It works in a vehicle with power');
    return (v.sys.applianceLevel() ?? 0) > 0 ? null : T('没电', 'No power');
  }

  /** what one has learnt to make, as a list: the left button makes the row picked and puts it in the hands */
  private benchList(p: Piece): ListSource {
    const ctx = this.ctx!;
    const self = this;
    const open = (): readonly Recipe[] => RECIPES.filter((r) => recipeOpen(r, ctx.learned ?? new Set()));
    let last: readonly Recipe[] = [];
    const costWords = (r: Recipe): string =>
      MATERIAL_IDS.filter((mm) => (r.cost[mm] ?? 0) > 0)
        .map((mm) => `${MATERIALS[mm].name.zh} ${r.cost[mm]}`)
        .join(' · ');
    return {
      title: '车载工作台',
      head: '学会了的做法',
      empty: '还没学会什么：路上找到图纸，拿在手里学会',
      takeWord: '制作',
      near: () => ctx.loose.list.includes(p.l) && self.withinReach(p.l) && !self.benchWhy(p),
      version: () => `${open().length}:${ctx.stock?.scrap ?? 0}:${ctx.stock?.components ?? 0}`,
      rows: () => {
        last = open();
        return last.map((r) => ({ zone: costWords(r), name: r.name.zh, mass: 0, icon: (ctx as unknown as { iconOf?(h: NonNullable<Held>): string | null }).iconOf?.(heldOfMakes(r.makes)) ?? null }));
      },
      load: () => 0,
      takeAt: (i) => {
        const r = last[i];
        const stock = ctx.stock;
        if (!r || !stock) return false;
        const short = shortOf(stock as Stock, r.cost);
        if (short) {
          ctx.ui.say(`还差 ${short.n} ${MATERIALS[short.mat].name.zh}`, 2.5);
          return false;
        }
        const v = ctx.vehicles.find((x) => (x as unknown) === p.l.riding?.on);
        if (!v || !v.sys.drawAppliances(BENCH_KW, BENCH_S)) {
          ctx.ui.say('没电', 2);
          return false;
        }
        const made = heldOfMakes(r.makes);
        // (into the hands: with no hand free nothing is made and nothing spent)
        if (intoHands(ctx as never, made) > 0) return false;
        spend(stock as Stock, r.cost);
        const delta: Partial<Record<(typeof MATERIAL_IDS)[number], number>> = {};
        for (const mm of MATERIAL_IDS) if (r.cost[mm]) delta[mm] = -(r.cost[mm] ?? 0);
        ctx.stockChanged?.(delta);
        ctx.sound('craft_done', 0.8);
        return true;
      },
    };
  }

  private pieceOfTarget(t: unknown): Piece | null {
    const tg = t as { kind?: string; device?: GarageDevice } | null;
    if (tg?.kind !== 'device' || !tg.device?.id.startsWith('nd-home:')) return null;
    const l = tg.device.loose;
    return (l && this.pieces.get(l)) ?? null;
  }

  /**
   * Q with a thing in the hands, the mark on a piece of furniture (docs/V3/plan/finish.md §十一 2 看着柜子按 Q): into its
   * first room with a gap for it — inside before on top — beside what stands there, the room's door opened first. True:
   * it took the press (the thing went in, or it was said why not).
   */
  stowInto(t: unknown, held: Held): boolean {
    const ctx = this.ctx!;
    const p = this.pieceOfTarget(t);
    if (!p || !held) return false;
    if (p.item.item === ND_PEGBOARD || p.item.item === ND_ROD_RACK) return this.hangOn(p, held);
    const rooms = roomsOf(p.item.item);
    if (!rooms.length) return false;
    if (held.kind === 'item' && FURNITURE.has(held.item.item)) return false;
    const b = ctx.cargo.boxOf(held);
    // (its size as it stands: its box's own, across the piece its z)
    const size = b ? { w: b.maxZ - b.minZ, d: b.maxX - b.minX, h: b.maxY - b.minY } : { w: 0.2, d: 0.2, h: 0.2 };
    const there = this.contentsOf(p);
    const order = rooms.map((r, i) => i).sort((a, c) => Number(!!rooms[a].top) - Number(!!rooms[c].top) || rooms[c].y - rooms[a].y);
    for (const i of order) {
      const room = rooms[i];
      // (as it stands, or turned a quarter)
      const ways = [size, { w: size.d, d: size.w, h: size.h }];
      const standing: Standing[] = there.filter((x) => x.room === i).map((x) => ({ at: x.lz, w: this.widthOf(x.l) }));
      for (let k = 0; k < ways.length; k++) {
        const at = spotIn(room, ways[k], standing);
        if (!at) continue;
        this.openFor(p, room, at.z);
        const o = ctx.core.origin;
        p.l.obj.updateMatrixWorld(true);
        // (its box's middle over the spot, its lowest point on the room's floor)
        const cx = b ? (b.minX + b.maxX) / 2 : 0;
        const cz = b ? (b.minZ + b.maxZ) / 2 : 0;
        const turn = k === 1 ? Math.PI / 2 : 0;
        const ox = k === 1 ? cz : cx;
        const oz = k === 1 ? -cx : cz;
        const w = p.l.obj.localToWorld(this.v3.set(at.x - ox, room.y - (b ? b.minY : 0), at.z - oz));
        const yaw = p.l.yaw - turn;
        const l = held.kind === 'part' ? ctx.loose.addPart(held.inst, w.x + o.x, w.y + o.y, w.z + o.z, yaw) : held.kind === 'tool' ? ctx.loose.addTool(held.tool, w.x + o.x, w.y + o.y, w.z + o.z, yaw) : ctx.loose.addItem(held.item, w.x + o.x, w.y + o.y, w.z + o.z, yaw);
        this.settle(p, l);
        ctx.player.held = null;
        ctx.sound('putdown', Math.min(1, massOf(held) / 6));
        return true;
      }
    }
    ctx.player.flashWhy('放不下了');
    return true;
  }

  /** how wide a thing standing in a piece is across it (its box's z as it lies; a hand's width when its model is not in) */
  private widthOf(l: Loose): number {
    const b = this.ctx?.cargo.boxOf(heldOf(l));
    if (!b) return 0.2;
    // (turned a quarter in the piece: its x is across)
    return Math.max(0.04, b.maxZ - b.minZ, 0);
  }

  /** a room's door opened to put a thing in it at `z` across it: the door that stands before that spot, if it is shut */
  private openFor(p: Piece, room: Room, z: number): void {
    if (!room.behind) return;
    const doors = p.movers.filter((m) => room.behind!.includes(m.name));
    // (the one whose leaf spans the spot; else the nearest)
    let best: Mover | null = null;
    let bd = Infinity;
    for (const m of doors) {
      const d = z < m.box.min[2] ? m.box.min[2] - z : z > m.box.max[2] ? z - m.box.max[2] : 0;
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (best && !(p.item.state?.open ?? []).includes(best.name)) this.toggle(p, best);
  }

  /**
   * What stands behind shut doors is not drawn (and nothing of it is in the way of the mark): looked at again when the
   * things lying about change or a door moves.
   */
  private hideShut(ctx: GameContext): void {
    if (ctx.loose.rev === this.hideRev && this.doorRev === this.hideDoors) return;
    this.hideRev = ctx.loose.rev;
    this.hideDoors = this.doorRev;
    const now = new Map<Loose, Piece>();
    for (const p of this.pieces.values()) {
      const rooms = roomsOf(p.item.item);
      if (!rooms.some((r) => r.behind && !r.glass)) continue;
      const open = p.item.state?.open;
      for (const c of this.contentsOf(p)) {
        const r = rooms[c.room];
        if (r.behind && !r.glass && roomShut(r, open)) now.set(c.l, p);
      }
    }
    for (const l of this.hidden.keys()) {
      if (now.has(l)) continue;
      l.obj.visible = true;
      l.shut = false;
      ctx.loose.keepApart(l.uid, false);
    }
    for (const l of now.keys()) {
      if (!this.hidden.has(l)) ctx.loose.keepApart(l.uid, true);
      l.obj.visible = false;
      // (shut in: the mark does not find it, nothing works it — Loose.shut, as in a place's shut cupboard)
      l.shut = true;
    }
    this.hidden.clear();
    for (const [l, p] of now) this.hidden.set(l, p);
    // (keepApart moved the things' revision on: this look is of now)
    this.hideRev = ctx.loose.rev;
  }

  /** is a thing lying about behind a piece's shut doors (not drawn, not for the mark) */
  isHidden(l: Loose): boolean {
    return this.hidden.has(l);
  }

  /**
   * Where a thing held out would stand on a board of a piece the line of sight goes into (docs/V3/plan/finish.md
   * §十一 2: R 仔细摆 — 对着某一层，东西吸到这一层的格子上，放哪是哪). The line comes in by the front of a room of a
   * piece (not its top — that is a surface as any; not one behind shut doors): the thing's middle goes where the line
   * meets the board, or the room's back, brought onto the board; kept on the board, and — on the squares — to a
   * twentieth of a metre from the board's back left corner. Said why not where it does not go: taller than the room
   * is clear, bigger than the board, or something standing there. null: the line goes into no piece's room.
   */
  boardAim(eye: THREE.Vector3, dir: THREE.Vector3, box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }, yaw: number, grid: boolean, reach: number): BoardAim | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let bestT = Infinity;
    let best: Piece | null = null;
    let bestRoom = -1;
    let bx = 0;
    let bz = 0;
    for (const p of this.pieces.values()) {
      const rooms = roomsOf(p.item.item);
      if (!rooms.length || (!p.l.resting && !p.l.riding)) continue;
      const obj = p.l.obj;
      obj.updateMatrixWorld();
      const e = obj.matrixWorld.elements;
      if ((e[12] - eye.x) ** 2 + (e[14] - eye.z) ** 2 > (reach + 1.5) ** 2) continue;
      this.m4.copy(obj.matrixWorld).invert();
      const el = this.v3.copy(eye).applyMatrix4(this.m4);
      const dl = this.v3b.copy(dir).transformDirection(this.m4);
      // (looked into from its front)
      if (dl.x > -0.05) continue;
      const open = p.item.state?.open;
      for (let i = 0; i < rooms.length; i++) {
        const r = rooms[i];
        if (r.top || (r.behind && roomShut(r, open))) continue;
        // where the line comes through the room's front
        const tf = (r.x[1] + 0.03 - el.x) / dl.x;
        if (!(tf > 0) || tf > reach || tf >= bestT) continue;
        const yf = el.y + tf * dl.y;
        const zf = el.z + tf * dl.z;
        if (yf < r.y - 0.02 || yf > r.y + r.clear || zf < r.z[0] || zf > r.z[1]) continue;
        // … and where it meets the board, or the room's back
        const tb = dl.y < -1e-4 ? (r.y - el.y) / dl.y : Infinity;
        const t = Math.max(tf, Math.min(tb, (r.x[0] - el.x) / dl.x));
        bestT = tf;
        best = p;
        bestRoom = i;
        bx = el.x + t * dl.x;
        bz = el.z + t * dl.z;
      }
    }
    if (!best) return null;
    const p = best;
    const r = roomsOf(p.item.item)[bestRoom];
    // the thing's footprint in the piece's frame (turned about the piece's own upright by how the two headings differ)
    const rel = yaw - p.l.yaw;
    const c = Math.cos(rel);
    const s = -Math.sin(rel);
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const mx = cx * c + cz * s;
    const mz = -cx * s + cz * c;
    const wx = box.maxX - box.minX;
    const wz = box.maxZ - box.minZ;
    const ex = (Math.abs(c) * wx + Math.abs(s) * wz) / 2;
    const ez = (Math.abs(s) * wx + Math.abs(c) * wz) / 2;
    let why = '';
    if (box.maxY - box.minY > r.clear - 0.005 || ex * 2 > r.x[1] - r.x[0] + 0.04 || ez * 2 > r.z[1] - r.z[0] + 0.002) why = '放不下';
    // its middle on the board: on the squares, then kept on the board (it may stand a little proud of the front)
    let ux = bx;
    let uz = bz;
    if (grid) {
      ux = r.x[0] + ex + Math.round((ux - ex - r.x[0]) / BOARD_CELL) * BOARD_CELL;
      uz = r.z[0] + ez + Math.round((uz - ez - r.z[0]) / BOARD_CELL) * BOARD_CELL;
    }
    ux = Math.min(Math.max(r.x[1] + 0.04 - ex, r.x[0] + ex), Math.max(r.x[0] + ex, ux));
    uz = Math.min(Math.max(r.z[1] - ez, r.z[0] + ez), Math.max(r.z[0] + ez, uz));
    if (!why) {
      for (const k of this.contentsOf(p)) {
        if (k.room !== bestRoom) continue;
        const ob = ctx.cargo.boxOf?.(heldOf(k.l));
        if (!ob) continue;
        const r2 = k.l.yaw - p.l.yaw;
        const c2 = Math.cos(r2);
        const s2 = -Math.sin(r2);
        const ox = k.lx + ((ob.minX + ob.maxX) / 2) * c2 + ((ob.minZ + ob.maxZ) / 2) * s2;
        const oz = k.lz - ((ob.minX + ob.maxX) / 2) * s2 + ((ob.minZ + ob.maxZ) / 2) * c2;
        const hx = (Math.abs(c2) * (ob.maxX - ob.minX) + Math.abs(s2) * (ob.maxZ - ob.minZ)) / 2;
        const hz = (Math.abs(s2) * (ob.maxX - ob.minX) + Math.abs(c2) * (ob.maxZ - ob.minZ)) / 2;
        if (Math.abs(ox - ux) < hx + ex - 0.004 && Math.abs(oz - uz) < hz + ez - 0.004) {
          why = '挡住了';
          break;
        }
      }
    }
    const o = ctx.core.origin;
    const w = p.l.obj.localToWorld(this.v3.set(ux - mx, r.y - box.minY + 0.002, uz - mz));
    return { ok: !why, why, x: w.x + o.x, y: w.y + o.y, z: w.z + o.z, on: p.l.riding?.on ?? null, dist: bestT };
  }

  /** the piece a thing stands in or hangs on, by name (looked up again when the things lying about change) */
  private keeperOf(l: Loose): string | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (ctx.loose.rev !== this.keptRev) {
      this.keptRev = ctx.loose.rev;
      this.kept.clear();
      for (const p of this.pieces.values()) for (const c of this.contentsOf(p)) this.kept.set(c.l, itemDef(p.item.item).name.zh);
    }
    return this.kept.get(l) ?? null;
  }

  /** what E on a seat would do: sit down, unless a piece of furniture is in the hands */
  seatWord(): Text {
    const h = this.ctx?.player.held;
    return SIT_WORD;
  }

  /** E on a seat: sit down on it (or move over to it from the one sat on) */
  sitOn(p: Piece, i: number): void {
    const ctx = this.ctx!;
    const h = ctx.player.held;
    if (h?.kind === 'item' && FURNITURE.has(h.item.item)) return void ctx.player.flashWhy('先放下家具');
    this.sit?.sit(p.l, i);
  }

  preStep(dt: number): void {
    this.sit?.preStep(dt);
  }

  dispose(): void {
    this.sit?.dispose();
    const ctx = this.ctx;
    if (ctx) {
      ctx.loose.keeper = null;
      ctx.loose.boards = null;
    }
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    this.hideShut(ctx);
    const hh = ctx.player.held;
    this.facing.saw(hh?.kind === 'item' && FURNITURE.has(hh.item.item) ? hh.item.uid : '', this.time);
    for (const p of this.pieces.values()) {
      const model = modelOf(p.l);
      if (model && p.dressedFor !== model) this.dress(p, model);
      // (put down again with what it carried: its things stand in it once it stands — and once it is drawn where it
      // stands: a thing just made stands at the world's middle until the things lying about are next placed)
      if (p.item.state?.carried && (p.l.resting || p.l.riding) && Math.abs(p.l.obj.position.x - p.l.x) + Math.abs(p.l.obj.position.y - p.l.y) + Math.abs(p.l.obj.position.z - p.l.z) < 0.01) this.unstash(p);
      const open = p.item.state?.open;
      for (const mv of p.movers) {
        const want = open?.includes(mv.name) ? 1 : 0;
        if (mv.t === want) continue;
        mv.t = want > mv.t ? Math.min(1, mv.t + dt / MOVE_S) : Math.max(0, mv.t - dt / MOVE_S);
        this.pose(mv);
      }
    }
  }

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const p of this.pieces.values()) {
      const dx = p.l.x - at.x;
      const dz = p.l.z - at.z;
      const rr = r + p.l.radius + 0.3;
      if (dx * dx + dz * dz > rr * rr) continue;
      // (the piece one sits on: only its other seat, to move over to)
      const on = this.sit?.on;
      if (on && on.l === p.l) {
        p.seats.forEach((s, i) => i !== on.i && out.push(s));
        continue;
      }
      for (const mv of p.movers) out.push(mv.device);
      for (const s of p.seats) out.push(s);
      if (p.item.item === ND_WORKBENCH) out.push((p.bench ??= this.benchDevice(p)));
      out.push(p.body);
    }
  }

  telemetry(): Record<string, unknown> {
    const on = this.sit?.on;
    return { pieces: [...this.pieces.values()].map((p) => ({ item: p.item.item, movers: p.movers.map((m) => `${m.name}:${m.t.toFixed(2)}`) })), sitting: on ? { item: on.l.item?.item, seat: on.i } : null };
  }

  readonly harness = {
    /** the pieces lying about: uid, kind, their doors and drawers */
    pieces: (): { uid: string; item: string; x: number; y: number; z: number; movers: string[] }[] =>
      [...this.pieces.values()].map((p) => ({ uid: p.l.uid, item: p.item.item, x: p.l.x, y: p.l.y, z: p.l.z, movers: p.movers.map((m) => m.name) })),
    /** sit down on a piece's seat (as E on it), stand up again (as Q held); where one sits */
    sit: (uid: string, i = 0): boolean => {
      const p = [...this.pieces.values()].find((x) => x.l.uid === uid);
      if (!p || !p.seats[i]) return false;
      this.sitOn(p, i);
      return !!this.sit?.on;
    },
    stand: (force = false): boolean => this.sit?.stand(force) ?? true,
    sitting: (): { uid: string; seat: number } | null => (this.sit?.on ? { uid: this.sit.on.l.uid, seat: this.sit.on.i } : null),
    /** a door or drawer of a piece opened or shut, at once */
    open: (uid: string, name: string, on: boolean): boolean => {
      const p = [...this.pieces.values()].find((x) => x.l.uid === uid);
      const mv = p?.movers.find((m) => m.name === name);
      if (!p || !mv) return false;
      const isOpen = (p.item.state?.open ?? []).includes(name);
      if (isOpen !== on) this.toggle(p, mv);
      return true;
    },
  };
}
