/**
 * The player in ModCar (docs/MODCAR.md §5): walking round the workshop with two hands' worth of things (the
 * hotbar's two slots, 1 and 2), picking things up, holding a part up to a vehicle (every mount that takes it
 * shows a ghost; the one under the mark gets the card of the vehicle with it), fitting and swapping with the
 * button held, taking parts off with the other button held, pouring fuel, water and oil — the can lines up
 * with an open filler by itself, the button held pours, the other draws it back out, and one stands still
 * while it flows — spraying and washing, opening doors and getting in.
 *
 * Keys: E or the left button = use (press) / fit, pour, spray (hold); the right button or F held = take
 * off (with a can: draw back out); G held = put down; 1 / 2 (or the wheel) = the other slot; I = the cards.
 */
import { frameVariant } from './assets';
import * as THREE from 'three';
import { fitPart, fitSub, mountsFor, removePart, removeSub, subMountsOf } from '../../core/modcar/build';
import { installSeconds, partDef, TYRE_SWAP_S } from '../../core/modcar/parts';
import { PALETTE } from '../../core/modcar/palette';
import { compare, perfWith, quickPerf } from '../../core/modcar/stats';
import { liquidOf, pour, siphon, siphonUse, TOOL_INFO, toolName, toolUse, workSurface, type LiquidKind, type Tool } from '../../core/modcar/tools';
import type { MountDef, PartInstance } from '../../core/modcar/types';
import { FootWalker, type FootInput } from '../../core/onfoot/walker';
import type { Land } from '../../core/onfoot/land';
import { SolidSet, type SolidSource } from '../../core/world/solids';
import { GhostLayer, type GhostSpec } from './ghosts';
import type { Action, SlotView, TransferView } from './hudItems';
import { deviceCard, fitCard, FUEL_ZH, partCard, toolCard, vehicleCard, type ItemCard, type Tone } from './itemInfo';
import type { Loose, LooseThings } from './loose';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';
import type { GarageDevice } from './garageStub';

export type Held = { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | null;

/** what the mark is on, and what the buttons would do to it (dist may be nudged to rank one over another; at = how far it really is then) */
type Target = (
  | { kind: 'loose'; loose: Loose; dist: number }
  | { kind: 'ghost'; v: ModVehicle; mount: MountDef; sub: string | null; replace: boolean; dist: number }
  | { kind: 'looseSub'; loose: Loose; sub: string; dist: number }
  | { kind: 'part'; v: ModVehicle; mount: MountDef; dist: number }
  /** a can at the filler its liquid goes into (open: the flap or cap is open, no shut bonnet over it) */
  | { kind: 'filler'; v: ModVehicle; liquid: LiquidKind; open: boolean; dist: number }
  /** a can held elsewhere on the body: the words say where its filler is */
  | { kind: 'pour'; v: ModVehicle; dist: number }
  /** the filler flap (or a motorcycle's tank cap), empty-handed: E opens and shuts it */
  | { kind: 'cap'; v: ModVehicle; dist: number }
  | { kind: 'surface'; v: ModVehicle; mount: MountDef | null; dist: number }
  | { kind: 'enter'; v: ModVehicle; dist: number }
  | { kind: 'device'; device: GarageDevice; dist: number }
) & { at?: number };

export interface PlayerHost {
  readonly vehicles: readonly ModVehicle[];
  readonly loose: LooseThings;
  readonly ui: ModUI;
  readonly origin: { x: number; y: number; z: number };
  readonly devices: readonly GarageDevice[];
  /** a vehicle's build changed: tell the systems, the view and any listeners (the checklist) */
  changed(v: ModVehicle, what: string): void;
  enter(v: ModVehicle): void;
  sound(name: string, gain?: number, mount?: string): void;
  /** the picture of a held thing for the hotbar (a data URL), null while it is being drawn */
  iconOf(h: NonNullable<Held>): string | null;
}

/** what F takes off a part lying about: its tyre (a wheel), else its turbo (an engine) */
function subOff(l: Loose): 'tire' | 'turbo' | null {
  return l.part?.sub.tire ? 'tire' : l.part?.sub.turbo ? 'turbo' : null;
}

const REACH = 2.6;
/** the card of what the mark is on shows only this close (m): from further off it would stand in the way of the view */
const CARD_NEAR = 2.2;
const GHOST_RANGE = 4.2;
/** angle (rad) within which the mark picks a ghost */
const GHOST_CONE = 0.2;
const DROP_HOLD = 0.45;

/** what each liquid is called, and its colour on the bars */
const LIQUID: Record<LiquidKind, { zh: string; into: string; filler: string; tone: Tone }> = {
  fuel: { zh: '油', into: '油箱', filler: '加油口', tone: 'petrol' },
  water: { zh: '水', into: '散热器', filler: '加水口', tone: 'water' },
  oil: { zh: '机油', into: '发动机', filler: '加机油口', tone: 'oil' },
};

const E: Action['keys'] = ['E', 'LMB'];
const F: Action['keys'] = ['F', 'RMB'];

export class ModPlayer {
  readonly walker: FootWalker;
  readonly solids = new SolidSet();
  readonly input: FootInput = { forward: 0, right: 0, run: false, crouch: false, jump: false };
  /** the hotbar: two things carried, the selected one in the hands */
  readonly slots: Held[] = [null, null];
  sel = 0;
  target: Target | null = null;
  readonly ghosts = new GhostLayer();
  /** assists: the holograms, the stat card (the ghosts' targeting works without them) */
  showGhostsOn = true;
  showCardOn = true;
  /** the item cards (I shows and hides them) */
  cardsOn = true;
  /** the colour a spray can is set to */
  paintIndex = 3;
  /** progress of the hold in hand (0…1), and what it is for (a target key) */
  progress = 0;
  private progressKey = '';
  private surfaceT = 0;
  private dropT = 0;
  /**
   * A fit or a take-off just finished with the button still down: nothing more until it is let go (with
   * holds this short, a button held on would put the part on, the old one back, and so on)
   */
  private spent = false;
  /** the buttons */
  primary = false;
  secondary = false;
  private primaryEdge = false;
  readonly eye = { x: 0, y: 0, z: 0 };
  readonly dir = { x: 1, y: 0, z: 0 };
  private readonly box = new THREE.Box3();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private cardKey = '';
  private cardCache: ReturnType<typeof compare> | null = null;
  /** liquid going from the can into a vehicle (in) or out of it into the can (out), and how much so far */
  flow: { dir: 'in' | 'out'; v: ModVehicle; liquid: LiquidKind; moved: number; fuel: string } | null = null;
  /** litres the flow moved this frame (0: none, or nothing left to move) */
  lastMoved = 0;
  private vehicleCardCache: { key: string; t: number; card: ItemCard } | null = null;
  private clock = 0;

  constructor(
    land: Land,
    private readonly host: PlayerHost,
  ) {
    this.walker = new FootWalker(land, this.solids);
  }

  /** what is in the hands: the selected slot */
  get held(): Held {
    return this.slots[this.sel];
  }

  set held(h: Held) {
    this.slots[this.sel] = h;
  }

  /** a slot something picked up can go into: the selected one when it is empty, else the other; −1 = both full */
  freeSlot(): number {
    if (!this.slots[this.sel]) return this.sel;
    const o = 1 - this.sel;
    return this.slots[o] ? -1 : o;
  }

  /** the other slot into the hands (1, 2 or the wheel) */
  select(i: number): void {
    if (i === this.sel || i < 0 || i >= this.slots.length || this.flow) return;
    this.sel = i;
    this.progress = 0;
    this.dropT = 0;
    const h = this.held;
    if (h?.kind === 'tool' && h.tool.kind === 'spray') this.paintIndex = h.tool.colour ?? this.paintIndex;
    this.host.sound('pickup', 0.3);
  }

  /** liquid is flowing (or the button is held at the filler): one stands still, the view holds */
  get transferring(): boolean {
    return !!this.flow;
  }

  removeSolids(s: SolidSource): void {
    this.solids.remove(s);
  }

  addSolids(s: SolidSource): void {
    this.solids.add(s);
  }

  /** the button went down this frame (a tap shorter than a frame still counts) */
  press(): void {
    this.primaryEdge = true;
    this.primary = true;
  }

  release(): void {
    this.primary = false;
  }

  wheel(delta: number): void {
    if (this.held?.kind === 'tool' && this.held.tool.kind === 'spray') {
      this.paintIndex = (this.paintIndex + (delta > 0 ? 1 : -1) + PALETTE.length) % PALETTE.length;
      this.held.tool.colour = this.paintIndex;
      return;
    }
    // (otherwise the wheel goes through the hotbar)
    this.select((this.sel + (delta > 0 ? 1 : this.slots.length - 1)) % this.slots.length);
  }

  // ------------------------------------------------------------------ every frame on foot

  update(dt: number, lookYaw: number, lookPitch: number, keys: { run: boolean; jump: boolean; drop: boolean; take: boolean; forward: number; right: number }): void {
    const w = this.walker;
    this.clock += dt;
    // (while liquid flows one stands still: from the frame the button goes down at an open filler)
    const t0 = this.target;
    const still = !!this.flow || (t0?.kind === 'filler' && t0.open && (this.primary || keys.take));
    this.input.forward = still ? 0 : keys.forward;
    this.input.right = still ? 0 : keys.right;
    this.input.run = keys.run;
    this.input.jump = keys.jump && !still;
    w.heading = lookYaw;
    w.pitch = lookPitch;
    w.load = this.held?.kind === 'part' ? (partDef(this.held.inst.part).carry === 'large' ? 'large' : 'medium') : 'none';
    w.advance(dt, this.input);
    this.input.jump = false;
    w.eye(this.eye);
    w.look(this.dir);
    this.secondary = keys.take;

    this.target = this.pick();
    this.showHighlight();
    this.showGhosts();
    this.act(dt, keys.drop);
    this.ghosts.update(dt);
    this.primaryEdge = false;
    this.ui();
  }

  // ------------------------------------------------------------------ what is under the mark

  private near(maxD: number): ModVehicle[] {
    const out: ModVehicle[] = [];
    for (const v of this.host.vehicles) {
      const d = Math.hypot(v.sim.px - this.walker.x, v.sim.pz - this.walker.z);
      if (d < maxD + v.sim.spec.body.halfLength) out.push(v);
    }
    return out;
  }

  /** world position of a mount's node (or of what is on it) */
  private mountWorld(v: ModVehicle, mount: MountDef, out: THREE.Vector3): THREE.Vector3 | null {
    const n = v.view.mountNode(mount.id);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    n.getWorldPosition(out);
    const o = this.host.origin;
    out.x += o.x;
    out.y += o.y;
    out.z += o.z;
    return out;
  }

  /** the doors and lids of the vehicles near under the mark (they open and shut with things in the hands too) */
  private panels(better: (t: Target) => void, extra = 0): void {
    for (const v of this.near(REACH + 1)) {
      for (const m of v.view.frame.mounts) {
        if (!v.build.parts[m.id] || !v.view.hasPanel(m.id)) continue;
        const b = v.view.boundsOf(m.id, this.box);
        if (!b) continue;
        const p = this.ray.intersectBox(b, this.hit);
        if (!p) continue;
        const d = p.distanceTo(this.ray.origin);
        if (d <= REACH) better({ kind: 'part', v, mount: m, dist: d + extra, at: d });
      }
    }
  }

  private pick(): Target | null {
    const o = this.host.origin;
    this.ray.origin.set(this.eye.x - o.x, this.eye.y - o.y, this.eye.z - o.z);
    this.ray.direction.set(this.dir.x, this.dir.y, this.dir.z).normalize();
    const held = this.held;
    let best: Target | null = null;
    const better = (t: Target): void => {
      if (!best || t.dist < best.dist) best = t;
    };

    // holding a part: the ghost nearest the line of sight
    if (held?.kind === 'part') {
      const def = partDef(held.inst.part);
      let bestAng = GHOST_CONE;
      const sub = def.cat === 'tire' ? 'tire' : def.cat === 'turbo' ? 'turbo' : null;
      for (const v of this.near(GHOST_RANGE)) {
        const frame = v.view.frame;
        const mounts: { m: MountDef; sub: string | null }[] = [];
        if (sub) {
          // a tyre goes on a fitted rim that takes one, a turbo on a fitted engine that takes one
          for (const m of frame.mounts) {
            const inst = v.build.parts[m.id];
            if (inst && subMountsOf(partDef(inst.part)).includes(sub)) mounts.push({ m, sub });
          }
        } else for (const m of mountsFor(frame, def)) mounts.push({ m, sub: null });
        for (const { m, sub: s } of mounts) {
          const p = this.mountWorld(v, m, this.v3);
          if (!p) continue;
          const dx = p.x - this.eye.x;
          const dy = p.y - this.eye.y;
          const dz = p.z - this.eye.z;
          const d = Math.hypot(dx, dy, dz);
          if (d > GHOST_RANGE) continue;
          const ang = Math.acos(Math.min(1, (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / Math.max(1e-6, d)));
          // nearer ghosts get a wider cone (they are bigger on screen)
          const cone = bestAng * Math.min(2.2, 1.6 / Math.max(0.7, d));
          if (ang < cone && ang < bestAng * 2.2) {
            bestAng = ang;
            const replace = s ? !!v.build.parts[m.id]?.sub[s] : !!v.build.parts[m.id];
            best = { kind: 'ghost', v, mount: m, sub: s, replace, dist: d };
          }
        }
      }
      // a tyre onto a rim lying about, a turbo onto an engine lying about
      if (sub === 'tire' || sub === 'turbo') {
        const takes = (l: Loose): boolean => !!l.part && !l.part.sub[sub] && (sub === 'tire' ? !!partDef(l.part.part).rim?.tire : !!partDef(l.part.part).engine?.turbo);
        const r = this.host.loose.pick(this.eye, this.dir, REACH, takes);
        if (r && (!best || r.dist < best.dist)) best = { kind: 'looseSub', loose: r.loose, sub, dist: r.dist };
      }
      // the ghost one aims at is under a shut lid: the lid itself is what E does (open it first)
      const g = best as Target | null;
      if (g?.kind === 'ghost') {
        const lid = g.v.view.shutOver(g.mount.id);
        const lm = lid ? g.v.view.frame.mounts.find((m) => m.id === lid) : undefined;
        const b = lm ? g.v.view.boundsOf(lm.id, this.box) : null;
        const p = b ? this.ray.intersectBox(b, this.hit) : null;
        if (lm && p && p.distanceTo(this.ray.origin) <= REACH + 0.5) return { kind: 'part', v: g.v, mount: lm, dist: p.distanceTo(this.ray.origin) };
        return g;
      }
      if (best) return best;
      // with something in the hands a door or a lid can still be opened
      this.panels(better);
    }

    const liquid = held?.kind === 'tool' ? liquidOf(held.tool) : null;
    const working = held?.kind === 'tool' && (held.tool.kind === 'spray' || held.tool.kind === 'sponge');
    // things lying about: picked up into a free slot (with something in the hands too)
    if (this.freeSlot() >= 0) {
      const r = this.host.loose.pick(this.eye, this.dir, REACH);
      if (r) better({ kind: 'loose', loose: r.loose, dist: r.dist });
    }
    // with a can the doors and lids still open (the bonnet over the radiator and the engine)
    if (liquid) this.panels(better, 0.05);
    for (const v of this.near(REACH + 1)) {
      let onPart = false;
      // parts on vehicles (empty hands: to take off; a spray can or sponge: to work on)
      if (!held || working) {
        for (const m of v.view.frame.mounts) {
          if (!v.build.parts[m.id]) continue;
          const b = v.view.boundsOf(m.id, this.box);
          if (!b) continue;
          const p = this.ray.intersectBox(b, this.hit);
          if (!p) continue;
          const d = p.distanceTo(this.ray.origin);
          if (d > REACH) continue;
          onPart = true;
          better(working ? { kind: 'surface', v, mount: m, dist: d } : { kind: 'part', v, mount: m, dist: d });
        }
      }
      // the fillers: a can lines up with the one its liquid goes into; empty hands open and shut the flap
      if (liquid) {
        const fd = v.view.fillerHit(liquid, this.ray, REACH + 0.3);
        // (a cap one aims at on purpose, with the can for it in the hands: it wins over the boxes round it)
        if (fd !== null) better({ kind: 'filler', v, liquid, open: v.view.fillerOpen(liquid), dist: Math.max(0, fd - 1), at: fd });
      } else if (!held && v.view.hasFlap) {
        const fd = v.view.fillerHit('fuel', this.ray, REACH + 0.3);
        // (a small thing one aims at on purpose: it wins over the coarse boxes of the parts round it)
        if (fd !== null) better({ kind: 'cap', v, dist: Math.max(0, fd - 0.3), at: fd });
      }
      // the body itself: get in, or paint and wash the frame; a can anywhere else on it: where its filler is
      const d = this.bodyDist(v);
      if (d === null || d > REACH + 0.4) continue;
      if (working) better({ kind: 'surface', v, mount: null, dist: d + 0.05, at: d });
      else if (liquid) better({ kind: 'pour', v, dist: d + 0.3, at: d });
      // (the body's box is coarse: a part the mark is on wins, an open bonnet standing well inside it too)
      else if (!held && !onPart) better({ kind: 'enter', v, dist: d + 0.25, at: d });
    }
    // garage devices
    for (const dv of this.host.devices) {
      const dx = dv.x - this.eye.x;
      const dy = dv.y - this.eye.y;
      const dz = dv.z - this.eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > REACH + 0.5) continue;
      const along = (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / d;
      if (Math.sqrt(Math.max(0, 1 - along * along)) * d < dv.radius) better({ kind: 'device', device: dv, dist: d });
    }
    return best;
  }

  /** how far along the line of sight it meets a vehicle's body box (null: it misses) */
  private bodyDist(v: ModVehicle): number | null {
    const o = this.host.origin;
    const sd = v.solid.update();
    const c = this.v3.set(sd.x - o.x, (sd.y0 + sd.y1) / 2 - o.y, sd.z - o.z);
    // the body box, turned to the vehicle's heading: test in its own frame
    const cos = Math.cos(-sd.yaw);
    const sin = Math.sin(-sd.yaw);
    const ox = this.ray.origin.x - c.x;
    const oz = this.ray.origin.z - c.z;
    const lo = this.lo.set(ox * cos - oz * sin, this.ray.origin.y - c.y, ox * sin + oz * cos);
    const ld = this.ld.set(this.ray.direction.x * cos - this.ray.direction.z * sin, this.ray.direction.y, this.ray.direction.x * sin + this.ray.direction.z * cos);
    this.hb.min.set(-sd.hx, -(sd.y1 - sd.y0) / 2, -sd.hz);
    this.hb.max.set(sd.hx, (sd.y1 - sd.y0) / 2, sd.hz);
    const hp = this.bodyRay.set(lo, ld).intersectBox(this.hb, this.hit);
    return hp ? hp.distanceTo(lo) : null;
  }

  private readonly lo = new THREE.Vector3();
  private readonly ld = new THREE.Vector3();
  private readonly hb = new THREE.Box3();
  private readonly bodyRay = new THREE.Ray();

  // ------------------------------------------------------------------ highlights

  private litVehicle: ModVehicle | null = null;

  /** the part about to come off (or be sprayed, washed) and the thing about to be picked up light up */
  private showHighlight(): void {
    const t = this.target;
    // (a part about to be sprayed or washed is not lit: one sees its real colour and the paint go on)
    const v = t?.kind === 'part' ? t.v : null;
    const mount = t?.kind === 'part' ? t.mount.id : null;
    if (this.litVehicle && this.litVehicle !== v) this.litVehicle.view.highlight(null);
    this.litVehicle = v;
    if (v) v.view.highlight(mount);
    this.host.loose.highlight(t?.kind === 'loose' || t?.kind === 'looseSub' ? t.loose : null);
  }

  /** nothing lit (getting in, the walker gone) */
  clearHighlight(): void {
    this.litVehicle?.view.highlight(null);
    this.litVehicle = null;
    this.host.loose.highlight(null);
  }

  // ------------------------------------------------------------------ ghosts

  private showGhosts(): void {
    const held = this.held;
    if (held?.kind !== 'part') {
      this.ghosts.clear();
      this.ghosts.selected = '';
      return;
    }
    const def = partDef(held.inst.part);
    const sub = def.cat === 'tire' ? 'tire' : def.cat === 'turbo' ? 'turbo' : null;
    const list: GhostSpec[] = [];
    for (const v of this.near(GHOST_RANGE)) {
      const frame = v.view.frame;
      const blocked = moving(v);
      if (sub) {
        for (const m of frame.mounts) {
          const inst = v.build.parts[m.id];
          if (!inst || !subMountsOf(partDef(inst.part)).includes(sub)) continue;
          const holder = v.view.nodeOf(m.id);
          if (!holder) continue;
          // on the part's own node (already mirrored with it): a turbo at the engine's M_turbo, a tyre round the rim
          const node = sub === 'turbo' ? (holder.getObjectByName('M_turbo') ?? holder) : holder;
          const kind = blocked || v.view.shutOver(m.id) ? 'blocked' : inst.sub[sub] ? 'replace' : 'empty';
          list.push({ node, mount: null, partId: def.id, variant: sub === 'tire' ? inst.part : '', kind, key: `${v.build.uid}:${m.id}:${sub}:${def.id}` });
        }
        continue;
      }
      for (const m of mountsFor(frame, def)) {
        // (a door, a bonnet, a boot lid: its ghost is the frame's own panel there)
        const shape = def.panel ? v.view.panelShape(m.id) : null;
        const node = shape?.node ?? v.view.mountNode(m.id);
        if (!node) continue;
        const kind = blocked || v.view.shutOver(m.id) ? 'blocked' : v.build.parts[m.id] ? 'replace' : 'empty';
        list.push({ node, mount: shape ? null : m, partId: def.id, variant: frameVariant(def.id, v.view.frame), kind, key: `${v.build.uid}:${m.id}:${def.id}`, make: shape?.make });
      }
    }
    this.ghosts.show(this.showGhostsOn ? list : []);
    const t = this.target;
    this.ghosts.selected = t?.kind === 'ghost' ? `${t.v.build.uid}:${t.mount.id}:${t.sub ? `${t.sub}:` : ''}${def.id}` : '';
  }

  // ------------------------------------------------------------------ doing things

  private keyOf(t: Target | null): string {
    if (!t) return '';
    switch (t.kind) {
      case 'loose':
      case 'looseSub':
        return `${t.kind}:${t.loose.uid}`;
      case 'ghost':
        return `ghost:${t.v.build.uid}:${t.mount.id}:${t.sub ?? ''}`;
      case 'part':
        return `part:${t.v.build.uid}:${t.mount.id}`;
      case 'surface':
        return `surface:${t.v.build.uid}:${t.mount?.id ?? 'frame'}`;
      case 'filler':
        return `filler:${t.v.build.uid}:${t.liquid}`;
      case 'pour':
      case 'enter':
      case 'cap':
        return `${t.kind}:${t.v.build.uid}`;
      case 'device':
        return `device:${t.device.id}`;
    }
  }

  private act(dt: number, dropKey: boolean): void {
    this.lastMoved = 0;
    if (!this.primary && !this.secondary) this.spent = false;
    const t = this.target;
    const key = this.keyOf(t);
    const host = this.host;
    // the liquid stops when the buttons are let go or the can is off the filler
    const flowing = t?.kind === 'filler' && t.open && this.held?.kind === 'tool' && (this.primary || this.secondary);
    if (!flowing && this.flow) this.endFlow();
    // G held: put down what is in the hands
    if (dropKey && this.held) {
      this.dropT += dt;
      if (this.dropT >= DROP_HOLD) {
        this.putDown();
        this.dropT = -Infinity;
      }
      return;
    }
    if (!dropKey) this.dropT = 0;

    // presses
    if (this.primaryEdge && t) {
      if (t.kind === 'loose') {
        const slot = this.freeSlot();
        if (slot < 0) return;
        this.sel = slot;
        host.loose.remove(t.loose);
        this.held = t.loose.part ? { kind: 'part', inst: t.loose.part } : { kind: 'tool', tool: t.loose.tool! };
        if (this.held.kind === 'tool' && this.held.tool.kind === 'spray') this.paintIndex = this.held.tool.colour ?? this.paintIndex;
        host.sound('pickup', partMass(this.held));
        // (what the mark was on is in the hands now)
        this.target = null;
        return;
      }
      if (t.kind === 'enter' && !this.held) {
        host.enter(t.v);
        return;
      }
      if (t.kind === 'part') {
        // a panel opens and shuts (with or without something in the hands); the driver's seat lets one in
        if (t.v.view.hasPanel(t.mount.id)) {
          const open = t.v.view.panelOpen(t.mount.id) < 0.5;
          t.v.view.setPanelOpen(t.mount.id, open);
          host.sound(open ? 'door_open' : 'door_close', 1, t.mount.id);
          // shut onto something too tall for it: say so
          const rest = open ? null : t.v.view.lidRest(t.mount.id).part;
          if (rest) host.ui.say(`${t.mount.label[host.ui.lang]}盖不严：${partDef(rest).name[host.ui.lang]}太高了。`, 3);
          return;
        }
        if (!this.held && (t.mount.cat === 'seat' || t.mount.cat === 'steering')) {
          host.enter(t.v);
          return;
        }
      }
      if (t.kind === 'device') {
        t.device.use();
        return;
      }
      if (t.kind === 'cap' && !this.held) {
        t.v.view.capOpen = !t.v.view.capOpen;
        host.sound('latch', 0.7);
        return;
      }
    }

    // holds: fit, take off, pour, spray, wash
    if (key !== this.progressKey) {
      this.progress = 0;
      this.progressKey = key;
      this.surfaceT = 0;
    }
    const held = this.held;
    if (!t) return;
    if ((t.kind === 'ghost' || t.kind === 'looseSub') && held?.kind === 'part' && this.primary) {
      if (this.spent) return;
      if (t.kind === 'ghost' && (moving(t.v) || t.v.view.shutOver(t.mount.id))) {
        this.progress = 0;
        return;
      }
      const need = t.kind === 'looseSub' && t.sub === 'tire' ? TYRE_SWAP_S : installSeconds(partDef(held.inst.part));
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        if (t.kind === 'ghost') this.fit(t.v, t.mount, t.sub, held.inst);
        else {
          fitSub(t.loose.part!, t.sub, held.inst);
          // redraw the loose wheel with its new tyre
          const l = t.loose;
          host.loose.remove(l);
          host.loose.addPart(l.part!, l.x, l.y, l.z, l.yaw).resting = true;
          this.held = null;
          host.sound('ratchet_done');
        }
      }
      return;
    }
    if (t.kind === 'part' && !held && this.secondary) {
      if (this.spent) return;
      if (moving(t.v) || t.v.view.shutOver(t.mount.id)) {
        this.progress = 0;
        return;
      }
      const need = installSeconds(partDef(t.v.build.parts[t.mount.id].part));
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        const inst = removePart(t.v.build, t.mount.id);
        if (inst) {
          this.held = { kind: 'part', inst };
          // (what the mark was on is in the hands now: the words this frame must not look for it on the mount)
          this.target = null;
          host.changed(t.v, `off:${t.mount.id}`);
          host.sound('remove_done', partDef(inst.part).mass);
        }
      }
      return;
    }
    const looseSub = t.kind === 'loose' && !held ? subOff(t.loose) : null;
    if (t.kind === 'loose' && looseSub && this.secondary) {
      if (this.spent) return;
      // a tyre off a wheel lying about, a turbo off an engine
      const sub = t.loose.part!.sub[looseSub];
      this.progress += dt / (looseSub === 'tire' ? TYRE_SWAP_S : installSeconds(partDef(sub.part)));
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        const off = removeSub(t.loose.part!, looseSub);
        const l = t.loose;
        host.loose.remove(l);
        host.loose.addPart(l.part!, l.x, l.y, l.z, l.yaw).resting = true;
        if (off) {
          this.held = { kind: 'part', inst: off };
          host.sound('remove_done', partDef(off.part).mass);
        }
      }
      return;
    }
    if (flowing && t.kind === 'filler' && held?.kind === 'tool') {
      const dir = this.primary ? 'in' : 'out';
      if (this.flow && (this.flow.dir !== dir || this.flow.v !== t.v)) this.endFlow();
      this.flow ??= { dir, v: t.v, liquid: t.liquid, moved: 0, fuel: '' };
      const moved = dir === 'in' ? pour(held.tool, t.v.build, dt) : siphon(held.tool, t.v.build, dt);
      this.lastMoved = moved;
      if (moved > 0) {
        this.flow.moved += moved;
        this.flow.fuel = held.tool.kind === 'jerrycan' ? FUEL_ZH[held.tool.fuel ?? 'petrol'] : LIQUID[t.liquid].zh;
        t.v.sys.rebuild();
        t.v.awake = 1;
        host.sound('pour', moved);
      }
      return;
    }
    if (t.kind === 'surface' && held?.kind === 'tool' && this.primary) {
      const inst = t.mount ? t.v.build.parts[t.mount.id] : null;
      const before = inst ? inst.paint : t.v.build.paint;
      this.surfaceT = workSurface(held.tool, t.v.build, inst, dt, this.surfaceT);
      this.progress = this.surfaceT;
      host.sound(held.tool.kind === 'spray' ? 'spray' : 'scrub');
      if (held.tool.kind === 'spray' && (inst ? inst.paint : t.v.build.paint) !== before) host.changed(t.v, `paint:${t.mount?.id ?? 'frame'}`);
      if (held.tool.kind === 'sponge' && this.surfaceT >= 1) {
        this.surfaceT = 0;
        host.changed(t.v, `wash:${t.mount?.id ?? 'frame'}`);
      }
      return;
    }
    if (!this.primary && !this.secondary) this.progress = 0;
  }

  /** the liquid stopped: say how much went where */
  private endFlow(): void {
    const f = this.flow;
    this.flow = null;
    if (!f || f.moved < 0.02) return;
    const what = f.fuel || LIQUID[f.liquid].zh;
    this.host.ui.items.showDone(f.dir === 'in' ? `加进去 <b>${f.moved.toFixed(1)} L</b> ${what}` : `抽出来 <b>${f.moved.toFixed(1)} L</b> ${what}`);
  }

  /** fit the held part to a mount (or a sub-mount); what was there comes into the hands */
  private fit(v: ModVehicle, mount: MountDef, sub: string | null, inst: PartInstance): void {
    let old: PartInstance | null;
    if (sub) {
      const host = v.build.parts[mount.id];
      if (!host) return;
      old = fitSub(host, sub, inst);
    } else {
      // a bare rim held up to a hub keeps the tyre that is on it now
      const was = v.build.parts[mount.id];
      if (partDef(inst.part).rim?.tire && !inst.sub.tire && was?.sub.tire) {
        inst.sub.tire = was.sub.tire;
        delete was.sub.tire;
      }
      old = fitPart(v.build, mount.id, inst);
    }
    this.held = old ? { kind: 'part', inst: old } : null;
    this.host.changed(v, `on:${mount.id}${sub ? `:${sub}` : ''}`);
    this.host.sound('ratchet_done');
  }

  /** put the held thing down in front, on whatever surface is there */
  putDown(): boolean {
    const held = this.held;
    if (!held) return false;
    if (this.flow) this.endFlow();
    const w = this.walker;
    const d = 0.8;
    const x = w.x + Math.cos(w.heading) * d;
    const z = w.z + Math.sin(w.heading) * d;
    const y = w.y + 1.0;
    const l = held.kind === 'part' ? this.host.loose.addPart(held.inst, x, y, z, w.heading) : this.host.loose.addTool(held.tool, x, y, z, w.heading);
    this.host.loose.drop(l);
    this.held = null;
    this.host.sound('putdown', partMass(held));
    return true;
  }

  // ------------------------------------------------------------------ the words on screen

  /** the card of a held thing (or of one lying about) */
  cardOf(h: NonNullable<Held>): ItemCard {
    return h.kind === 'part' ? partCard(h.inst) : toolCard(h.tool);
  }

  /** a vehicle's card, made again a few times a second (it reads the whole build) */
  private vehicleCard(v: ModVehicle): ItemCard {
    const c = this.vehicleCardCache;
    if (c && c.key === v.build.uid && this.clock - c.t < 0.25) return c.card;
    const card = vehicleCard(v);
    this.vehicleCardCache = { key: v.build.uid, t: this.clock, card };
    return card;
  }

  /** the card of the container a filler leads into (the tank, the radiator, the engine) */
  private containerCard(v: ModVehicle, liquid: LiquidKind): ItemCard | null {
    const m = v.view.fillerMount(liquid);
    const inst = m ? v.build.parts[m] : null;
    return inst ? partCard(inst, { mount: v.view.frame.name.zh }) : null;
  }

  /** where a liquid's filler is, in words */
  private fillerWhere(v: ModVehicle, liquid: LiquidKind): string {
    if (liquid === 'fuel') return v.view.capWhere;
    if (!v.view.fillerMount(liquid)) return liquid === 'water' ? '（这辆车没有散热器）' : '（这辆车没有发动机）';
    return liquid === 'water' ? '散热器顶上的蓝色盖子' : '发动机顶上的黄色盖子';
  }

  private ui(): void {
    const ui = this.host.ui;
    const t = this.target;
    const held = this.held;
    const name = (inst: PartInstance): string => partDef(inst.part).name[ui.lang];
    const acts: Action[] = [];
    let aim: ItemCard | null = null;
    let xfer: TransferView | null = null;
    const both = this.freeSlot() < 0;
    if (t) {
      switch (t.kind) {
        case 'loose': {
          const nm = t.loose.part ? name(t.loose.part) : toolName(t.loose.tool!);
          aim = t.loose.part ? partCard(t.loose.part) : toolCard(t.loose.tool!);
          acts.push({ keys: E, text: `拿起 <b>${nm}</b>${held ? `（放进快捷栏 ${this.freeSlot() + 1}）` : ''}` });
          const off = held ? null : subOff(t.loose);
          if (off) acts.push({ keys: F, hold: true, text: off === 'tire' ? '拆下轮胎' : '拆下涡轮' });
          break;
        }
        case 'looseSub':
          aim = partCard(t.loose.part!);
          acts.push({ keys: E, hold: true, text: `装到 <b>${name(t.loose.part!)}</b> 上` });
          break;
        case 'ghost': {
          if (held?.kind !== 'part') break;
          const inst = held.inst;
          const replaced = t.sub ? (t.v.build.parts[t.mount.id]?.sub[t.sub] ?? null) : (t.v.build.parts[t.mount.id] ?? null);
          const lid = t.v.view.shutOver(t.mount.id);
          const lidName = lid ? (t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? '') : '';
          const warn = moving(t.v) ? '车在动：先停稳、拉手刹' : lid ? `${lidName}关着：看着它按 E 打开` : undefined;
          aim = this.showCardOn ? fitCard(t.v, t.mount.label[ui.lang], inst, this.compareLines(t.v, t.mount, t.sub, inst), replaced, warn) : null;
          if (moving(t.v)) acts.push({ keys: E, hold: true, text: `<b>${name(inst)}</b> · 车在动，停下再装`, off: true });
          else if (lid) acts.push({ keys: E, text: `先打开${lidName}`, off: true });
          else acts.push({ keys: E, hold: true, text: `${t.replace ? '替换' : '装上'} <b>${name(inst)}</b> · ${t.mount.label[ui.lang]}` });
          break;
        }
        case 'part': {
          const inst = t.v.build.parts[t.mount.id];
          if (!inst) break;
          aim = partCard(inst, { mount: t.mount.label[ui.lang] });
          const panel = t.v.view.hasPanel(t.mount.id);
          const seat = t.mount.cat === 'seat' || t.mount.cat === 'steering';
          if (panel) acts.push({ keys: E, text: `${t.v.view.panelOpen(t.mount.id) > 0.5 ? '关上' : '打开'} <b>${name(inst)}</b>` });
          else if (seat && !held) acts.push({ keys: E, text: `上车 <b>${t.v.view.frame.name[ui.lang]}</b>` });
          if (!held) {
            const lid = t.v.view.shutOver(t.mount.id);
            if (moving(t.v)) acts.push({ keys: F, hold: true, text: '拆下 · 车在动', off: true });
            else if (lid) acts.push({ keys: F, hold: true, text: `拆下 · 先打开${t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? ''}`, off: true });
            else acts.push({ keys: F, hold: true, text: `拆下 <b>${name(inst)}</b>` });
          }
          break;
        }
        case 'filler': {
          if (held?.kind !== 'tool') break;
          const L = LIQUID[t.liquid];
          aim = this.containerCard(t.v, t.liquid);
          if (!t.open) {
            if (t.liquid === 'fuel') {
              acts.push({ keys: ['E'], text: `${L.filler}盖关着：空手按 E 打开`, off: true });
              acts.push(both ? { keys: ['G'], hold: true, text: '两只手都占着：先放下一件', off: true } : { keys: [this.sel === 0 ? '2' : '1'], text: '切到空手' });
            } else acts.push({ keys: E, text: '先打开引擎盖', off: true });
            break;
          }
          const use = toolUse(held.tool, t.v.build);
          const back = siphonUse(held.tool, t.v.build);
          acts.push(use.can ? { keys: E, hold: true, text: `${use.word[ui.lang]} · 倒进<b>${L.into}</b>` } : { keys: E, hold: true, text: `${use.word[ui.lang]}：${use.why?.[ui.lang] ?? ''}`, off: true });
          acts.push(back.can ? { keys: F, hold: true, text: `把${L.zh}抽回${TOOL_INFO[held.tool.kind].name.zh}里` } : { keys: F, hold: true, text: `抽回来：${back.why?.[ui.lang] ?? ''}`, off: true });
          if (this.flow) xfer = this.transferView(t.v, t.liquid, held.tool);
          break;
        }
        case 'pour': {
          if (held?.kind !== 'tool') break;
          const liquid = liquidOf(held.tool)!;
          const L = LIQUID[liquid];
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, text: `${L.filler}在<b>${this.fillerWhere(t.v, liquid)}</b>：对着它`, off: true });
          break;
        }
        case 'cap': {
          const open = t.v.view.capOpen;
          aim = this.containerCard(t.v, 'fuel');
          acts.push({ keys: E, text: `${open ? '关上' : '打开'} <b>加油口盖</b>` });
          break;
        }
        case 'surface': {
          if (held?.kind !== 'tool') break;
          const tool = held.tool;
          const inst = t.mount ? t.v.build.parts[t.mount.id] : null;
          const what = inst ? name(inst) : t.v.view.frame.name[ui.lang];
          aim = inst ? partCard(inst, { mount: t.mount!.label[ui.lang] }) : this.vehicleCard(t.v);
          acts.push({ keys: ['LMB'], hold: true, text: `${tool.kind === 'spray' ? '喷漆' : '擦洗'} <b>${what}</b>` });
          break;
        }
        case 'enter':
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, text: `上车 <b>${t.v.view.frame.name[ui.lang]}</b>` });
          break;
        case 'device':
          aim = deviceCard(t.device);
          acts.push({ keys: E, text: t.device.word[ui.lang] });
          break;
      }
    }
    // (the card only for what is close by: from further off it would stand in the way of the view)
    if (aim && t && (t.at ?? t.dist) > CARD_NEAR) aim = null;
    if (t?.kind === 'loose' && both) acts.splice(0, acts.length, { keys: ['G'], hold: true, text: '两只手都占着：先放下一件', off: true });
    if (this.dropT > 0 && held) acts.splice(0, acts.length, { keys: ['G'], hold: true, text: `放下 <b>${held.kind === 'part' ? name(held.inst) : toolName(held.tool)}</b>` });
    // (while liquid flows the strip saying from what into what stands where these words are)
    if (xfer) acts.length = 0;
    const ring = this.dropT > 0 && held ? Math.min(1, this.dropT / DROP_HOLD) : this.progress > 0 ? this.progress : -1;
    ui.prompt(true, '', ring);
    const items = ui.items;
    items.showActions(acts);
    items.showCards(held ? this.cardOf(held) : null, aim, this.cardsOn);
    items.showKeys(this.heldKeys());
    items.showTransfer(xfer);
    items.showHotbar(this.slotViews(), this.sel);
    ui.showPaint(held?.kind === 'tool' && held.tool.kind === 'spray' ? PALETTE.map((p) => p.hex) : null, this.paintIndex);
  }

  /** what liquid goes from what into what, with how much is in each */
  private transferView(v: ModVehicle, liquid: LiquidKind, tool: Tool): TransferView {
    const L = LIQUID[liquid];
    const info = TOOL_INFO[tool.kind];
    const m = v.view.fillerMount(liquid);
    const inst = m ? v.build.parts[m] : null;
    let have = 0;
    let max = 1;
    if (inst) {
      const def = partDef(inst.part);
      if (liquid === 'fuel') {
        have = Object.values(inst.fluids.fuel ?? {}).reduce((a, b) => a + (b ?? 0), 0);
        max = def.fuelTank?.litres ?? 1;
      } else if (liquid === 'water') {
        have = inst.fluids.coolantL ?? 0;
        max = def.radiator?.coolantL ?? 1;
      } else {
        have = inst.fluids.oilL ?? 0;
        max = def.engine?.oilL ?? 1;
      }
    }
    const tone: Tone = tool.kind === 'jerrycan' ? (tool.fuel ?? 'petrol') : L.tone;
    const can = { name: tool.kind === 'jerrycan' ? `油桶 · ${FUEL_ZH[tool.fuel ?? 'petrol']}` : info.name.zh, amount: `${(tool.litres ?? 0).toFixed(1)} / ${info.capacity} L`, fill: (tool.litres ?? 0) / info.capacity };
    const box = { name: `${v.view.frame.name.zh}的${L.into}`, amount: `${have.toFixed(1)} / ${max.toFixed(max >= 10 ? 0 : 1)} L`, fill: have / Math.max(1e-6, max) };
    return this.flow?.dir === 'out' ? { from: box, to: can, tone } : { from: can, to: box, tone };
  }

  /** every action of the thing in the hands (down the right) */
  private heldKeys(): Action[] {
    const h = this.held;
    const out: Action[] = [];
    const other = this.slots[1 - this.sel];
    if (!h) {
      out.push({ keys: E, text: '拿起 / 开关 / 上车' }, { keys: F, hold: true, text: '拆下零件' });
    } else if (h.kind === 'tool') {
      const liquid = liquidOf(h.tool);
      if (liquid) {
        const L = LIQUID[liquid];
        out.push({ keys: E, hold: true, text: `${liquid === 'fuel' ? '加油' : liquid === 'water' ? '加水' : '加机油'}（对着${L.filler}）` });
        out.push({ keys: F, hold: true, text: `把${L.zh}抽回来` });
      } else if (h.tool.kind === 'spray') out.push({ keys: ['LMB'], hold: true, text: '喷漆' }, { keys: ['Wheel'], text: '换颜色' });
      else out.push({ keys: ['LMB'], hold: true, text: '擦洗' });
    }
    if (h) out.push({ keys: ['G'], hold: true, text: '放下' });
    // (a part goes where its ghost lights up: the line over the hotbar says so when it is aimed)
    if (h || other) out.push({ keys: [this.sel === 0 ? '2' : '1'], text: other ? `换成${other.kind === 'part' ? partDef(other.inst.part).name.zh : TOOL_INFO[other.tool.kind].name.zh}` : '空出手' });
    out.push({ keys: ['I'], text: this.cardsOn ? '隐藏物品信息' : '显示物品信息' });
    return out;
  }

  /** the hotbar's two slots as shown */
  slotViews(): SlotView[] {
    return this.slots.map((h) => {
      if (!h) return { icon: null, name: '空', empty: true };
      const nameOf = h.kind === 'part' ? partDef(h.inst.part).name.zh : toolName(h.tool);
      const t = h.kind === 'tool' ? h.tool : null;
      const liquid = t ? liquidOf(t) : null;
      const fill = t && liquid ? { value: t.litres ?? 0, max: TOOL_INFO[t.kind].capacity, tone: (t.kind === 'jerrycan' ? (t.fuel ?? 'petrol') : LIQUID[liquid].tone) as Tone } : undefined;
      return { icon: this.host.iconOf(h), name: nameOf, empty: false, fill };
    });
  }

  /** the vehicle now against with the held part on that mount (cached while aimed) */
  private compareLines(v: ModVehicle, mount: MountDef, sub: string | null, inst: PartInstance): ReturnType<typeof compare> {
    const key = `${v.build.uid}:${mount.id}:${sub ?? ''}:${inst.uid}:${v.sys.derived.mass.toFixed(1)}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      const before = quickPerf(v.sys.derived);
      const after = perfWith(v.build, mount.id, inst, sub);
      this.cardCache = compare(before, after);
    }
    return this.cardCache ?? [];
  }

  telemetry(): Record<string, string | number | boolean> {
    const t = this.target;
    const id = (h: Held): string => (h ? (h.kind === 'part' ? h.inst.part : `tool:${h.tool.kind}`) : '');
    return {
      held: id(this.held),
      slot1: id(this.slots[0]),
      slot2: id(this.slots[1]),
      sel: this.sel,
      target: this.keyOf(t),
      progress: this.progress,
      flow: this.flow ? `${this.flow.dir}:${this.flow.liquid}:${this.flow.moved.toFixed(2)}` : '',
      footX: this.walker.x,
      footZ: this.walker.z,
      heading: this.walker.heading,
    };
  }
}

/** a vehicle that is rolling cannot be worked on */
function moving(v: ModVehicle): boolean {
  return Math.abs(v.sim.kmh) > 1.5;
}

function partMass(h: Held): number {
  if (!h) return 0;
  if (h.kind === 'part') return partDef(h.inst.part).mass;
  return h.tool.kind === 'jerrycan' ? 4 + (h.tool.litres ?? 0) * 0.75 : 1;
}

export { TOOL_INFO };
