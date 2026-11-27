/**
 * What a container holds stands in it (the player's ask, 2026-11-26: "打开保温箱，冰箱，柜子的时候不要跳出来这个UI，我希望
 * 是玩家打开后，能直接看到里面存放的物品，鼠标对准该物品就可以捡起来，应该体验是和NOMAD DRIVE一样的，所见即所得"). A
 * container that opens — the cooler's lid (v3/lids), a fridge's door and a nightstand's drawer (v3/nd-home), a chest's
 * lid (v3/nd-dig) — has boards inside it (core/v3/nd/store.ts), and what is in it (ItemInstance.inside, as ever: its
 * slots, its weight, how slowly things go off in it, carried with it) stands on them, each thing where it was put (the
 * container's ItemState.spots). Opened, the things are drawn there — those on a door's shelves swing with the door,
 * those in a drawer slide out with it — and each is a thing the mark finds: the left button takes it into the hands as
 * a thing lying about is taken. A thing in the hands held out to be put down just so (R, v3/nd-place) goes onto a board
 * of an open container the line of sight goes into, where one looks, as onto any surface; Q with the mark on an open
 * container puts it in at the first place it fits. Either says why not: the container full (its slots, its weight),
 * the thing too big for where it would go, something in the way. Shut, nothing of it is drawn and nothing of it is
 * reached; opened again, there it all is. What comes in without a place (an old save's, the list's — Tab still lists a
 * container's things — what a chest is found with) is laid out beside what is there when it is next opened, and what
 * lay on others comes down when what was under it is taken out.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { accepts, boxDecay, countOf, itemDef, itemMass, itemModelOf, putInside, roomInside, setFreshRate, settleItem, splitStack, takeInside, type ItemInstance } from '../../../../core/modcar/items';
import type { Text } from '../../../../core/modcar/types';
import type { Box3 } from '../../../../core/v3/nd/place';
import { aimOn, boardOpen, boardsOf, clearOf, firstFit, fitWhy, layOut, placedOf, settle, spotOf, spotSaved, standing, UPRIGHT, type Board, type Placed, type Spot } from '../../../../core/v3/nd/store';
import { itemGlb } from '../../assets';
import type { GarageDevice } from '../../garageStub';
import type { GameContext } from '../../kernel/context';
import type { InteractSource, PlanPoint } from '../../kernel/interact';
import { itemCardKept, type ItemCard } from '../../itemInfo';
import { itemNow } from '../../itemTime';
import { bringUp } from '../../listSources';
import type { BoardAim, Loose } from '../../loose';
import { boxHit, modelOf, type PartBox } from '../../nd/kit';
import { heldName, type Held } from '../../player';

const T = (zh: string, en: string): Text => ({ zh, en });

/** what is in a container stays drawn this long after it is shut (s): its lid, door or drawer swinging to */
const SHUT_S = 0.55;
/** a thing's box for the mark: 1.5 cm larger all round, never under 8 cm a side (as a thing lying about's: loose.ts hitBoxOf) */
const HIT_PAD = 0.015;
const HIT_MIN = 0.08;

const UP = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Z = new THREE.Vector3(0, 0, 1);

/** a thing drawn in a container */
interface Shown {
  it: ItemInstance;
  /** the thing as the hands take it */
  held: NonNullable<Held>;
  /** its uid and its model's kind: drawn again when that changes (it went off into another kind) */
  key: string;
  owner: string;
  g: THREE.Group;
  spot: Spot;
  /** its box as drawn (its own frame), and padded for the mark */
  box: Box3;
  hit: PartBox;
  device: GarageDevice;
  /** its look told where it is drawn since it was last put there */
  told: boolean;
}

/** a container lying about (or riding), and what of it is drawn */
interface View {
  l: Loose;
  boards: readonly Board[];
  model: THREE.Object3D | null;
  /** the movers the boards ride on: their frames as the model came in, inverted (null: not known yet) */
  rest: Map<string, THREE.Matrix4> | null;
  restAsked: boolean;
  /** a group under the things lying about for each frame its boards are in ('' the container's, else a mover's) */
  holders: Map<string, THREE.Group>;
  movers: Map<string, THREE.Object3D>;
  shown: Map<string, Shown>;
  /** what was in it when its things were last given places */
  sig: number;
  /** drawn now; when it was shut (−1: it is open) */
  drawn: boolean;
  shutAt: number;
}

export class NdStore implements System<GameContext>, InteractSource {
  readonly id = 'nd-store';
  readonly after = ['nd-home', 'lids', 'nd-dig'];
  readonly budget = { cpuMs: 0.3 };
  private ctx: GameContext | null = null;
  /** its clock (s) */
  time = 0;
  private readonly views = new Map<Loose, View>();
  private readonly byUid = new Map<string, View>();
  private rev = -1;
  private readonly m4 = new THREE.Matrix4();
  private readonly m4b = new THREE.Matrix4();
  private readonly qa = new THREE.Quaternion();
  private readonly qb = new THREE.Quaternion();
  private readonly v3 = new THREE.Vector3();
  private readonly o3 = new THREE.Vector3();
  private readonly d3 = new THREE.Vector3();
  /** what has been done (the harness's) */
  private taken = 0;
  private put = 0;

  init(ctx: GameContext): void {
    this.ctx = ctx;
    // (Q with a thing in the hands, the mark on an open container: into it — before the home's furniture)
    const shelf = ctx.player.shelver;
    ctx.player.shelver = {
      word: (t) => this.qWord(t) ?? shelf?.word(t) ?? null,
      into: (t, held) => this.qInto(t, held) || (shelf?.into(t, held) ?? false),
    };
    // (a thing held out to be put down just so: onto a board of an open container the line of sight goes into — or the home's)
    const boards = ctx.loose.boards;
    ctx.loose.boards = (eye, dir, box, yaw, grid, reach) => {
      const a = boards ? boards(eye, dir, box, yaw, grid, reach) : null;
      const b = this.boardAim(eye, dir, box, yaw, grid, reach);
      return !a ? b : !b ? a : b.dist < a.dist ? b : a;
    };
  }

  dispose(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const v of this.views.values()) this.forget(ctx, v);
    this.views.clear();
    this.byUid.clear();
  }

  // ------------------------------------------------------------------ the containers lying about

  private refresh(ctx: GameContext): void {
    const loose = ctx.loose;
    if (loose.rev === this.rev) return;
    this.rev = loose.rev;
    const seen = new Set<Loose>();
    for (const l of loose.list) {
      if (!l.item) continue;
      const boards = boardsOf(l.item.item);
      if (!boards.length || !itemDef(l.item.item).holds) continue;
      seen.add(l);
      if (!this.views.has(l)) {
        const v: View = { l, boards, model: null, rest: null, restAsked: false, holders: new Map(), movers: new Map(), shown: new Map(), sig: -1, drawn: false, shutAt: -1 };
        this.views.set(l, v);
        this.byUid.set(l.uid, v);
        // (the frames of the movers its boards ride on, asked for now: known before it is first opened)
        this.askRest(v);
      }
    }
    for (const [l, v] of [...this.views]) {
      if (seen.has(l)) continue;
      this.forget(ctx, v);
      this.views.delete(l);
      this.byUid.delete(l.uid);
    }
  }

  /** is a board of a container reached now: what it is behind stands open (a chest keeps its lid's being open with its lock) */
  private reached(it: ItemInstance, b: Board): boolean {
    if (boardOpen(b, it.state?.open)) return true;
    return !!it.state?.chest?.open && b.behind.includes('LID');
  }

  private anyReached(v: View): boolean {
    const it = v.l.item;
    if (!it) return false;
    for (const b of v.boards) if (this.reached(it, b)) return true;
    return false;
  }

  lateUpdate(dt: number, ctx: GameContext): void {
    this.time += dt;
    this.refresh(ctx);
    for (const v of this.views.values()) this.stepView(ctx, v);
  }

  private stepView(ctx: GameContext, v: View): void {
    const model = modelOf(v.l);
    if (model !== v.model) {
      // (its model came in, or was made again: what was drawn in the one before goes)
      this.forget(ctx, v);
      v.model = model;
      v.movers.clear();
      v.sig = -1;
    }
    if (!model) return;
    const open = this.anyReached(v);
    if (open) v.shutAt = -1;
    else if (v.drawn && v.shutAt < 0) v.shutAt = this.time;
    if (!open && !(v.drawn && this.time - v.shutAt < SHUT_S)) {
      if (v.drawn) this.forget(ctx, v);
      return;
    }
    // (the frames of the movers its boards ride on, as the model came in: asked for when it came)
    if (!v.rest) return;
    // (what is in it changed, or it is drawn again: places for what has none, the things drawn as they are now —
    // a box not measured yet: asked again the next frame)
    const sig = insideSig(v.l.item!);
    if (sig !== v.sig || !v.drawn) {
      if (this.place(ctx, v)) v.sig = sig;
      this.sync(ctx, v);
    }
    this.follow(ctx, v);
    v.drawn = true;
  }

  /** the movers' frames as the model came in (its own GLB, as cached), inverted: a board on one stands so in its frame */
  private askRest(v: View): void {
    if (v.restAsked) return;
    v.restAsked = true;
    const names = [...new Set(v.boards.map((b) => b.on).filter((n): n is string => !!n))];
    if (!names.length) {
      v.rest = new Map();
      return;
    }
    void itemGlb(itemModelOf(v.l.item!)).then((m) => {
      if (!m || !this.views.has(v.l)) return;
      const scene = m.scene;
      scene.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert();
      const rest = new Map<string, THREE.Matrix4>();
      for (const n of names) {
        const node = scene.getObjectByName(n);
        if (node) rest.set(n, new THREE.Matrix4().multiplyMatrices(inv, node.matrixWorld).invert());
      }
      v.rest = rest;
    });
  }

  /** a thing's box as it lies (its model's, measured: null while it is not) */
  private boxOf(ctx: GameContext, it: ItemInstance): Box3 | null {
    return ctx.cargo.boxOf({ kind: 'item', item: it });
  }

  /**
   * Places for what is in it that has none (laid out beside what is there), the heaps come down where something went
   * from under them, and the places of what is not in it any more let go. False while a thing's box is not measured yet
   * (asked again the next frame).
   */
  private place(ctx: GameContext, v: View): boolean {
    const it = v.l.item!;
    const list = it.inside ?? [];
    const boxes: Box3[] = [];
    for (const x of list) {
      const b = this.boxOf(ctx, x);
      if (!b) return false;
      boxes.push(b);
    }
    const was = it.state?.spots ?? {};
    const have: number[] = [];
    const spots: (Spot | null)[] = list.map((x, i) => {
      const s = spotOf(was[x.uid], v.boards.length);
      if (s) have.push(i);
      return s;
    });
    // (what lay on others: down onto what is still under it)
    const down = settle(
      have.map((i) => boxes[i]),
      have.map((i) => spots[i]!),
    );
    have.forEach((i, k) => (spots[i] = down[k]));
    const placed: Placed[] = have.map((i) => placedOf(boxes[i], spots[i]!));
    const none = list.map((_, i) => i).filter((i) => !spots[i]);
    if (none.length) {
      const laid = layOut(
        v.boards,
        none.map((i) => boxes[i]),
        placed,
      );
      none.forEach((i, k) => (spots[i] = laid[k]));
    }
    const next: Record<string, number[]> = {};
    for (let i = 0; i < list.length; i++) next[list[i].uid] = spotSaved(spots[i]!);
    if (list.length) (it.state ??= {}).spots = next;
    else if (it.state?.spots) {
      delete it.state.spots;
      if (!Object.keys(it.state).length) delete it.state;
    }
    return true;
  }

  /** the things drawn as what is in it is now: each at its place, made for what it is now, gone when it is gone */
  private sync(ctx: GameContext, v: View): void {
    const it = v.l.item!;
    const list = it.inside ?? [];
    const spots = it.state?.spots;
    const seen = new Set<string>();
    for (const x of list) {
      const s = spotOf(spots?.[x.uid], v.boards.length);
      if (!s) continue;
      const key = `${x.uid}|${itemModelOf(x)}`;
      seen.add(x.uid);
      let sh = v.shown.get(x.uid);
      if (sh && (sh.key !== key || sh.it !== x || (sh.spot.b !== s.b && (v.boards[sh.spot.b].on ?? '') !== (v.boards[s.b].on ?? '')))) {
        this.drop(ctx, v, sh);
        sh = undefined;
      }
      if (!sh) this.make(ctx, v, x, s, key);
      else if (!sameSpot(sh.spot, s)) {
        sh.spot = s;
        this.pose(v, sh, sh.g);
      }
    }
    for (const [uid, sh] of [...v.shown]) if (!seen.has(uid)) this.drop(ctx, v, sh);
  }

  private make(ctx: GameContext, v: View, x: ItemInstance, s: Spot, key: string): void {
    const owner = `nd-store:${v.l.uid}:${x.uid}`;
    const sh: Shown = { it: x, held: { kind: 'item', item: x }, key, owner, g: null as unknown as THREE.Group, spot: s, box: { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 }, hit: { min: [0, 0, 0], max: [0, 0, 0] }, device: null as unknown as GarageDevice, told: false };
    sh.g = ctx.loose.shownItem(x, owner, (g) => this.pose(v, sh, g));
    sh.g.name = owner;
    this.holder(ctx, v, v.boards[s.b].on ?? '').add(sh.g);
    sh.device = this.deviceOf(v, sh);
    v.shown.set(x.uid, sh);
  }

  private drop(ctx: GameContext, v: View, sh: Shown): void {
    sh.g.removeFromParent();
    ctx.loose.dropShown(sh.owner);
    v.shown.delete(sh.it.uid);
  }

  /** nothing of it drawn any more */
  private forget(ctx: GameContext, v: View): void {
    for (const sh of [...v.shown.values()]) this.drop(ctx, v, sh);
    for (const h of v.holders.values()) h.removeFromParent();
    v.holders.clear();
    v.drawn = false;
    v.shutAt = -1;
  }

  /** a thing where its place says (`g`: its group, its box as drawn in userData.box) */
  private pose(v: View, sh: Shown, g: THREE.Group): void {
    const b3 = g.userData.box as THREE.Box3;
    sh.box = { minX: b3.min.x, maxX: b3.max.x, minY: b3.min.y, maxY: b3.max.y, minZ: b3.min.z, maxZ: b3.max.z };
    const s = sh.spot;
    const board = v.boards[s.b];
    const st = standing(sh.box, s);
    g.position.set(s.x, board.y + (s.up ?? 0) + st.lift, s.z);
    this.qa.setFromAxisAngle(UP, -s.r);
    if (s.lie === 'z') this.qb.setFromAxisAngle(AX_Z, Math.PI / 2);
    else if (s.lie === 'x') this.qb.setFromAxisAngle(AX_X, -Math.PI / 2);
    else this.qb.identity();
    g.quaternion.copy(this.qa).multiply(this.qb);
    sh.told = false;
    // (its box for the mark)
    const hb = sh.hit as { min: [number, number, number]; max: [number, number, number] };
    const mid = [(b3.min.x + b3.max.x) / 2, (b3.min.y + b3.max.y) / 2, (b3.min.z + b3.max.z) / 2];
    const half = [Math.max(HIT_MIN / 2, (b3.max.x - b3.min.x) / 2 + HIT_PAD), Math.max(HIT_MIN / 2, (b3.max.y - b3.min.y) / 2 + HIT_PAD), Math.max(HIT_MIN / 2, (b3.max.z - b3.min.z) / 2 + HIT_PAD)];
    for (let k = 0; k < 3; k++) {
      hb.min[k] = mid[k] - half[k];
      hb.max[k] = mid[k] + half[k];
    }
  }

  /** the group a board's things are drawn in: under the things lying about, moved each frame with the container (or the mover the board rides on) */
  private holder(ctx: GameContext, v: View, on: string): THREE.Group {
    let h = v.holders.get(on);
    if (!h) {
      h = new THREE.Group();
      h.name = `nd-store:${v.l.uid}:${on || 'in'}`;
      h.matrixAutoUpdate = false;
      ctx.loose.root.add(h);
      v.holders.set(on, h);
    }
    return h;
  }

  /** the groups where the container is drawn now (and every board's, so a thing can be aimed onto one with nothing on it) */
  private follow(ctx: GameContext, v: View): void {
    const model = v.model!;
    for (const b of v.boards) this.holder(ctx, v, b.on ?? '');
    const root = ctx.loose.root;
    root.updateMatrixWorld();
    const rootInv = this.m4b.copy(root.matrixWorld).invert();
    model.updateWorldMatrix(true, false);
    let moved = false;
    for (const [on, h] of v.holders) {
      if (!on) this.m4.copy(model.matrixWorld);
      else {
        let node = v.movers.get(on);
        if (!node) {
          node = model.getObjectByName(on) ?? model;
          v.movers.set(on, node);
        }
        node.updateWorldMatrix(true, false);
        const rest = v.rest?.get(on);
        this.m4.copy(node.matrixWorld);
        if (rest) this.m4.multiply(rest);
      }
      this.m4.premultiply(rootInv);
      // (standing still — most containers do: nothing to tell)
      if (this.m4.equals(h.matrix) && !h.matrixWorldNeedsUpdate) continue;
      h.matrix.copy(this.m4);
      h.matrixWorldNeedsUpdate = true;
      h.updateMatrixWorld(true);
      moved = true;
    }
    // (where each thing is drawn told to its look — its dirt is of its own frame: when it moved, or was put there)
    for (const sh of v.shown.values()) {
      if (!moved && sh.told) continue;
      sh.g.updateMatrixWorld(true);
      ctx.loose.placeShown(sh.owner, sh.g);
      sh.told = true;
    }
  }

  // ------------------------------------------------------------------ taken out, put in

  private deviceOf(v: View, sh: Shown): GarageDevice {
    const self = this;
    const l = v.l;
    return {
      id: sh.owner,
      get x() {
        return l.x;
      },
      get y() {
        return l.y + l.mid;
      },
      get z() {
        return l.z;
      },
      radius: 0.15,
      get word(): Text {
        return T(`拿起 <b>${heldName(sh.held)}</b>`, 'Pick it up');
      },
      get why(): Text | null {
        return (self.ctx?.player.roomFor(sh.held) ?? 0) > 0 ? null : T('手满了', 'Hands full');
      },
      get card(): ItemCard {
        return itemCardKept(sh.it, itemNow(), self.time);
      },
      ground: true,
      lights: sh.owner,
      use: () => self.takeOut(v, sh),
      hit: (ray, reach) => boxHit(sh.g, ray, sh.hit, reach),
    };
  }

  /**
   * A thing taken out into the hands, as a thing lying about is taken up: onto a stack of its kind, else into a free
   * slot (the one selected then); what of a stack the hands have no room for stays where it stood. None of it: 手满了.
   */
  takeOut(v: View, sh: Shown): boolean {
    const ctx = this.ctx;
    const box = v.l.item;
    if (!ctx || !box) return false;
    const i = box.inside?.indexOf(sh.it) ?? -1;
    if (i < 0) return false;
    const now = itemNow();
    const all = countOf(sh.it);
    const kg = itemMass(sh.it);
    const out = takeInside(box, i, now)!;
    // (a thing that has gone off is what it has become before it is handed over)
    settleItem(out, now);
    const held: NonNullable<Held> = { kind: 'item', item: out };
    let back: number;
    try {
      back = ctx.player.receive(held, box);
    } catch (e) {
      backIn(box, i, out, now);
      throw e;
    }
    if (back > 0) backIn(box, i, out, now);
    if (back >= all) {
      ctx.player.flashWhy('手满了');
      return false;
    }
    if (back <= 0) {
      bringUp(ctx.player, held);
      if (box.state?.spots) delete box.state.spots[out.uid];
    }
    this.changed(v);
    ctx.sound('pickup', (kg * (all - back)) / all);
    this.taken++;
    return true;
  }

  /**
   * Why a thing in the hands does not go into a container at a place ('' it goes): a thing it does not take, the
   * container full (its slots, its weight), too big for that place, something standing there.
   */
  private putWhy(v: View, held: NonNullable<Held>, s: Spot, box: Box3): string {
    const it = v.l.item!;
    const name = itemDef(it.item).name.zh;
    if (held.kind !== 'item' || held.item === it || !accepts(it, held.item)) return `${name}不装这种东西`;
    if (roomInside(it, held.item, itemNow()) <= 0) return `${name}装满了`;
    const st = standing(box, s);
    if (fitWhy(v.boards[s.b], st)) return '放不下';
    if (!clearOf(st.rect, this.placedOn(v, s.b))) return '挡住了';
    return '';
  }

  /** what stands on a board now (its footprints), or on every board */
  private placedOn(v: View, b = -1): import('../../../../core/v3/nd/place').Rect[] {
    const out = [];
    for (const sh of v.shown.values()) if (b < 0 || sh.spot.b === b) out.push(standing(sh.box, sh.spot).rect);
    return out;
  }

  /**
   * The thing in the hands into the container at a place: a stack of its own there while a slot is free (as much of it
   * as the container's weight takes: the rest stays in the hands); with none free, onto the stacks in it it joins (they
   * stand where they stand). How many of it did NOT go in.
   */
  private putInto(v: View, held: NonNullable<Held>, s: Spot): number {
    const ctx = this.ctx!;
    const box = v.l.item!;
    if (held.kind !== 'item') return 1;
    const it = held.item;
    const now = itemNow();
    const all = countOf(it);
    const room = roomInside(box, it, now);
    if (room <= 0) return all;
    const kg = itemMass(it);
    let left: number;
    if ((box.inside?.length ?? 0) < itemDef(box.item).holds!.slots) {
      const go = room < all ? splitStack(it, room) : it;
      if (!go) return all;
      setFreshRate(go, now, boxDecay(box));
      (box.inside ??= []).push(go);
      ((box.state ??= {}).spots ??= {})[go.uid] = spotSaved(s);
      left = go === it ? 0 : all - room;
    } else left = putInside(box, it, now);
    if (left >= all) return all;
    this.changed(v);
    ctx.sound('putdown', Math.min(1, (kg * (all - left)) / all / 6));
    this.put++;
    return left;
  }

  /** what is in it changed: the things lying about are told (lists made again; a place it belonged to lets it go), what it rides in is weighed again */
  private changed(v: View): void {
    const ctx = this.ctx!;
    ctx.loose.touch(v.l);
    const on = v.l.riding?.on;
    const veh = on ? ctx.vehicles.find((x) => (x as unknown) === on) : undefined;
    if (veh) ctx.cargo.weigh(veh);
  }

  // ------------------------------------------------------------------ Q: into the container the mark is on

  /** the container a target of the mark is (the thing itself, its lid's, door's, drawer's or a thing's in it), null: none */
  private viewOf(t: unknown): View | null {
    const tg = t as { kind?: string; loose?: Loose; device?: GarageDevice } | null;
    if (!tg) return null;
    if (tg.kind === 'loose' && tg.loose) return this.views.get(tg.loose) ?? null;
    if (tg.kind !== 'device' || !tg.device) return null;
    const l = tg.device.loose;
    if (l) return this.views.get(l) ?? null;
    const m = /^(lids|nd-home|nd-dig|nd-store):([^:]+)/.exec(tg.device.id);
    return m ? (this.byUid.get(m[2]) ?? null) : null;
  }

  private qWord(t: unknown): string | null {
    const v = this.viewOf(t);
    if (!v || !v.drawn || !this.anyReached(v)) return null;
    return `放进 <b>${itemDef(v.l.item!.item).name.zh}</b>`;
  }

  /** Q, the mark on an open container: the thing in the hands in at the first place it fits; true: the press is taken */
  private qInto(t: unknown, held: Held): boolean {
    const ctx = this.ctx;
    const v = this.viewOf(t);
    if (!ctx || !held || !v || !v.drawn || !this.anyReached(v)) return false;
    const it = v.l.item!;
    const name = itemDef(it.item).name.zh;
    if (held.kind !== 'item' || held.item === it || !accepts(it, held.item)) {
      ctx.player.flashWhy(`${name}不装这种东西`);
      return true;
    }
    if (roomInside(it, held.item, itemNow()) <= 0) {
      ctx.player.flashWhy(`${name}装满了`);
      return true;
    }
    const box = ctx.cargo.boxOf(held);
    if (!box) return true;
    const open = v.boards.map((b, i) => (this.reached(it, b) ? i : -1)).filter((i) => i >= 0);
    const placed: Placed[] = [...v.shown.values()].map((sh) => placedOf(sh.box, sh.spot));
    const s = firstFit(v.boards, open, box, placed, UPRIGHT);
    if (!s) {
      ctx.player.flashWhy('放不下了');
      return true;
    }
    const left = this.putInto(v, held, s);
    if (left <= 0) ctx.player.held = null;
    return true;
  }

  // ------------------------------------------------------------------ R: put down just so, onto a board

  /**
   * Where a thing held out would stand on a board of an open container the line of sight goes into (render space): the
   * line comes into the board's room by its open side — the top of a cooler, a chest or a drawer pulled out, the front
   * of a fridge's shelf, the inner side of a shelf in its open door — and the thing's middle goes where the line comes
   * down to the board (or where it leaves the room, over the board), kept on it; said why not where it may not go.
   * null: the line goes into no open container.
   */
  boardAim(eye: THREE.Vector3, dir: THREE.Vector3, box: Box3, yaw: number, grid: boolean, reach: number): BoardAim | null {
    const ctx = this.ctx;
    const held = ctx?.player.held;
    if (!ctx || !held) return null;
    const o = ctx.core.origin;
    let best: { v: View; b: number; h: THREE.Group; t: number; px: number; pz: number } | null = null;
    for (const v of this.views.values()) {
      if (!v.drawn || !v.model) continue;
      const l = v.l;
      if ((l.x - (eye.x + o.x)) ** 2 + (l.z - (eye.z + o.z)) ** 2 > (reach + 1.5) ** 2) continue;
      for (let bi = 0; bi < v.boards.length; bi++) {
        const board = v.boards[bi];
        if (!this.reached(l.item!, board)) continue;
        const h = v.holders.get(board.on ?? '');
        if (!h) continue;
        this.m4.copy(h.matrixWorld).invert();
        const ro = this.o3.copy(eye).applyMatrix4(this.m4);
        const rd = this.d3.copy(dir).transformDirection(this.m4);
        const hit = enterRoom(board, ro, rd);
        if (!hit || hit.t > reach || (best && hit.t >= best.t)) continue;
        best = { v, b: bi, h, t: hit.t, px: hit.x, pz: hit.z };
      }
    }
    if (!best) return null;
    const { v, b, h } = best;
    const board = v.boards[b];
    // (its turn on the board: its heading against the frame the board is in — a door's turned with the door)
    const e = h.matrixWorld.elements;
    const r = yaw - Math.atan2(e[2], e[0]);
    const at = aimOn(board, box, r, undefined, best.px, best.pz, grid);
    const s: Spot = { b, x: at.x, z: at.z, r };
    const why = this.putWhy(v, held, s, box);
    const st = standing(box, s);
    const w = h.localToWorld(this.v3.set(at.x, board.y + st.lift + 0.002, at.z));
    return {
      ok: !why,
      why,
      x: w.x + o.x,
      y: w.y + o.y,
      z: w.z + o.z,
      on: v.l.riding?.on ?? null,
      dist: best.t,
      put: (thing) => {
        const tb = ctx.cargo.boxOf(thing) ?? box;
        const no = this.putWhy(v, thing, s, tb);
        if (no) {
          ctx.player.flashWhy(no);
          return -1;
        }
        const n = thing.kind === 'item' ? countOf(thing.item) : 1;
        const left = this.putInto(v, thing, s);
        return left >= n ? -1 : left;
      },
    };
  }

  // ------------------------------------------------------------------ the mark

  near(at: PlanPoint, r: number, out: GarageDevice[]): void {
    for (const v of this.views.values()) {
      if (!v.drawn || !v.shown.size) continue;
      const dx = v.l.x - at.x;
      const dz = v.l.z - at.z;
      const rr = r + v.l.radius + 0.5;
      if (dx * dx + dz * dz > rr * rr) continue;
      const it = v.l.item!;
      for (const sh of v.shown.values()) if (this.reached(it, v.boards[sh.spot.b])) out.push(sh.device);
    }
  }

  telemetry(): Record<string, unknown> {
    let drawn = 0;
    let shown = 0;
    for (const v of this.views.values()) {
      if (v.drawn) drawn++;
      shown += v.shown.size;
    }
    return { containers: this.views.size, drawn, shown, taken: this.taken, put: this.put };
  }

  readonly harness = {
    /** the containers lying about: their boards reached, the things drawn in them (where, in their frames and in the world) */
    views: (): { uid: string; item: string; drawn: boolean; reached: boolean[]; things: { uid: string; item: string; n: number; b: number; x: number; z: number; r: number; lie: string | null; up: number; drawn: boolean; at: { x: number; y: number; z: number } }[] }[] =>
      [...this.views.values()].map((v) => ({
        uid: v.l.uid,
        item: v.l.item!.item,
        drawn: v.drawn,
        reached: v.boards.map((b) => this.reached(v.l.item!, b)),
        things: [...v.shown.values()].map((sh) => ({ uid: sh.it.uid, item: sh.it.item, n: countOf(sh.it), b: sh.spot.b, x: sh.spot.x, z: sh.spot.z, r: sh.spot.r, lie: sh.spot.lie ?? null, up: sh.spot.up ?? 0, drawn: sh.g.children.length > 0, at: this.midOf(sh) })),
      })),
    /** where a board's floor's middle is (world), or a point of it (its frame's x, z): to look at */
    boardAt: (uid: string, b: number, x?: number, z?: number): { x: number; y: number; z: number } | null => {
      const v = this.byUid.get(uid);
      const board = v?.boards[b];
      const h = board ? v.holders.get(board.on ?? '') : undefined;
      if (!v || !board || !h || !this.ctx) return null;
      const o = this.ctx.core.origin;
      const w = h.localToWorld(new THREE.Vector3(x ?? (board.x[0] + board.x[1]) / 2, board.y, z ?? (board.z[0] + board.z[1]) / 2));
      return { x: w.x + o.x, y: w.y + o.y, z: w.z + o.z };
    },
  };

  /** a drawn thing's middle (world) */
  private midOf(sh: Shown): { x: number; y: number; z: number } {
    const o = this.ctx!.core.origin;
    const b = sh.box;
    const w = sh.g.localToWorld(new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2));
    return { x: w.x + o.x, y: w.y + o.y, z: w.z + o.z };
  }
}

/** what came out of row i and did not go into the hands after all is back where it was, going off as the box has it */
function backIn(box: ItemInstance, i: number, out: ItemInstance, now: number): void {
  const list = (box.inside ??= []);
  if (!list.includes(out)) list.splice(Math.min(i, list.length), 0, out);
  setFreshRate(out, now, boxDecay(box));
}

/** a number that is another whenever what is in a container is (which things, of what kind, how many) */
function insideSig(box: ItemInstance): number {
  const list = box.inside;
  if (!list) return 0;
  let h = list.length;
  for (const x of list) {
    h = (Math.imul(h, 31) + strKey(x.uid)) | 0;
    h = (Math.imul(h, 31) + strKey(x.item)) | 0;
    h = (Math.imul(h, 31) + (x.n ?? 1)) | 0;
  }
  return h;
}

function strKey(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

function sameSpot(a: Spot, b: Spot): boolean {
  return a.b === b.b && a.x === b.x && a.z === b.z && a.r === b.r && a.lie === b.lie && (a.up ?? 0) === (b.up ?? 0);
}

/**
 * Where a line (the board's frame) comes into a board's room by its open side, and where it comes down to the board
 * or leaves the room over it: null when it misses the room or comes in by another side (through a wall).
 */
function enterRoom(board: Board, o: THREE.Vector3, d: THREE.Vector3): { t: number; x: number; z: number } | null {
  const lo = [board.x[0], board.y, board.z[0]];
  const hi = [board.x[1], board.y + board.clear, board.z[1]];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  let t0 = -Infinity;
  let t1 = Infinity;
  let axis = -1;
  let side = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(dd[k]) < 1e-9) {
      if (oo[k] < lo[k] || oo[k] > hi[k]) return null;
      continue;
    }
    let a = (lo[k] - oo[k]) / dd[k];
    let b = (hi[k] - oo[k]) / dd[k];
    // (which face it comes in by: the low one when it goes up the axis)
    let s = -1;
    if (a > b) {
      [a, b] = [b, a];
      s = 1;
    }
    if (a > t0) {
      t0 = a;
      axis = k;
      side = s;
    }
    if (b < t1) t1 = b;
  }
  if (!(t1 > t0) || t0 < 0) return null;
  const by = board.from === 'top' ? axis === 1 && side > 0 : board.from === 'front' ? axis === 0 && side > 0 : axis === 0 && side < 0;
  if (!by) return null;
  // (down to the board, or where it leaves the room)
  const tf = d.y < -1e-6 ? (board.y - o.y) / d.y : Infinity;
  const t = Math.max(t0, Math.min(tf, t1));
  return { t: t0, x: o.x + t * d.x, z: o.z + t * d.z };
}
