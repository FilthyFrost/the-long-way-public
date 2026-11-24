/**
 * The ND furniture in the game (docs/ND/PLAN.md; the kinds: core/v3/nd/items.ts, the models: tools/blender/items/
 * nd_home.py): each piece lying about — in a prefab building, by the road, in a vehicle — offers its doors and
 * drawers to the mark as devices of their own (E swings a door open on its hinge or shut, pulls a drawer out or
 * pushes it in), and itself as one more a little further off than they are (E picks it up, F held as well), so a
 * big piece's coarse sphere never takes the mark from what is on it or in front of it. A fridge's door open, its
 * list opens with it (what is in it: Tab as for any box). Which doors stand open is kept on the piece itself
 * (ItemState.open), so it is saved with it. Things put down over a piece land on it — a table's top, a counter, a
 * bookshelf's shelves and its top, a fridge's top, a chair's or a sofa's seat — as Nomad Drive's furniture has its
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
import { ND_BOOKSHELF, ND_CABINET, ND_CHAIR, ND_CHAIR_FOLD, ND_DINNER_CHAIR, ND_DINNER_TABLE, ND_FRIDGE, ND_KITCHEN_STAND, ND_NIGHTSTAND, ND_SOFA, ND_SOFA_2, ND_STOOL, ND_TABLE, ND_TOP_CABINET, ND_WALL_SHELF, ND_WC } from '../../../../core/v3/nd/items';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { boxList, openList } from '../../listSources';
import type { Loose } from '../../loose';
import { heldOf } from '../../player';
import { boxHit, FaceTheHand, modelOf, type PartBox } from '../../nd/kit';
import { SEATS, SIT_WORD, Sitting } from './sit';

declare module '../../../../core/modcar/items' {
  interface ItemState {
    /** the doors and drawers of a piece of furniture standing open (their names) */
    open?: string[];
  }
}

const T = (zh: string, en: string): Text => ({ zh, en });

const FURNITURE = new Set([ND_TABLE, ND_CHAIR, ND_SOFA, ND_BOOKSHELF, ND_FRIDGE, ND_KITCHEN_STAND, ND_TOP_CABINET, ND_NIGHTSTAND, ND_CHAIR_FOLD, ND_DINNER_TABLE, ND_DINNER_CHAIR, ND_STOOL, ND_SOFA_2, ND_WC, ND_WALL_SHELF, ND_CABINET]);
/** the big pieces: taken from where they stand in a vehicle with E held this long (Nomad Drive: on a placement surface, 0.5 s) */
const BIG = new Set([ND_TABLE, ND_SOFA, ND_BOOKSHELF, ND_FRIDGE, ND_KITCHEN_STAND, ND_TOP_CABINET, ND_NIGHTSTAND, ND_DINNER_TABLE, ND_SOFA_2, ND_WC, ND_WALL_SHELF, ND_CABINET]);
const TAKE_HOLD_S = 0.5;
/** a door swings this far (rad), a drawer comes out this much of its depth; how quickly (s) */
const DOOR_OPEN = 1.85;
const DRAWER_OUT = 0.72;
const MOVE_S = 0.4;

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
  box: PartBox;
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
        // (its doors and drawers first, where they are)
        return d === null ? null : d + 0.1;
      },
    };
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
      const mv: Mover = {
        name,
        obj: o,
        q0: o.quaternion.clone(),
        p0: o.position.clone(),
        box: { min: [this.b3.min.x - 0.01, this.b3.min.y, this.b3.min.z], max: [this.b3.max.x + 0.02, this.b3.max.y, this.b3.max.z] },
        door,
        // (the leaf runs from the hinge towards its middle: its free edge comes out towards the front, +x)
        turn: Math.sign(c.z - pivot.z) || 1,
        out: (this.b3.max.x - this.b3.min.x) * DRAWER_OUT,
        t: open.has(name) ? 1 : 0,
        device: null as unknown as GarageDevice,
      };
      const l = p.l;
      const self = this;
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
        hit: (ray, reach) => boxHit(l.obj, ray, mv.box, reach),
      };
      p.movers.push(mv);
    });
    if (p.movers.length) this.ctx?.loose.keepApart(p.l.uid, true);
    p.box = null;
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
    ctx.loose.touch(p.l);
    ctx.sound(mv.door ? (now ? 'door_open' : 'door_house_close') : 'container_open', 0.4);
    // a fridge open: what is in it, in the list
    if (now && p.item.item === ND_FRIDGE && itemDef(p.item.item).holds) {
      const l = p.l;
      const src = boxList(p.item, { near: () => this.withinReach(l) });
      if (src) openList(src);
    }
  }

  private withinReach(l: Loose): boolean {
    const w = this.ctx?.player.walker;
    return !!w && Math.hypot(l.x - w.x, l.z - w.z) < 2.6;
  }

  pickUp(p: Piece): void {
    const ctx = this.ctx!;
    if (this.sit?.on) return void ctx.player.flashWhy('先起身');
    if (!ctx.player.takeLoose(p.l)) ctx.player.flashWhy('手满了');
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
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    const hh = ctx.player.held;
    this.facing.saw(hh?.kind === 'item' && FURNITURE.has(hh.item.item) ? hh.item.uid : '', this.time);
    for (const p of this.pieces.values()) {
      const model = modelOf(p.l);
      if (model && p.dressedFor !== model) this.dress(p, model);
      const open = p.item.state?.open;
      for (const mv of p.movers) {
        const want = open?.includes(mv.name) ? 1 : 0;
        if (mv.t === want) continue;
        mv.t = want > mv.t ? Math.min(1, mv.t + dt / MOVE_S) : Math.max(0, mv.t - dt / MOVE_S);
        const k = mv.t * mv.t * (3 - 2 * mv.t);
        if (mv.door) {
          this.q.setFromAxisAngle(UP, mv.turn * DOOR_OPEN * k);
          mv.obj.quaternion.copy(mv.q0).multiply(this.q);
        } else mv.obj.position.set(mv.p0.x + mv.out * k, mv.p0.y, mv.p0.z);
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
