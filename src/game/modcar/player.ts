/**
 * The player in ModCar (docs/MODCAR.md §5): walking round the workshop, picking things up, holding a
 * part up to a vehicle (every mount that takes it shows a ghost; the one under the mark gets the stat
 * card), fitting and swapping with the button held, taking parts off with the other button held,
 * pouring fuel, water and oil, spraying and washing, opening doors and getting in.
 *
 * Keys: E or the left button = use (press) / fit, pour, spray (hold); the right button or F held =
 * take off; G held = put down; the wheel = spray colour. In the seat: E gets out.
 */
import { frameVariant } from './assets';
import * as THREE from 'three';
import { fitPart, fitSub, mountsFor, removePart, removeSub, subMountsOf } from '../../core/modcar/build';
import { installSeconds, partDef } from '../../core/modcar/parts';
import { PALETTE } from '../../core/modcar/palette';
import { compare, perfWith, quickPerf } from '../../core/modcar/stats';
import { pour, TOOL_INFO, toolName, toolUse, workSurface, type Tool } from '../../core/modcar/tools';
import type { MountDef, PartInstance } from '../../core/modcar/types';
import { FootWalker, type FootInput } from '../../core/onfoot/walker';
import type { Land } from '../../core/onfoot/land';
import { SolidSet, type SolidSource } from '../../core/world/solids';
import { GhostLayer, type GhostSpec } from './ghosts';
import type { Loose, LooseThings } from './loose';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';
import type { GarageDevice } from './garageStub';

export type Held = { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | null;

/** what the mark is on, and what the buttons would do to it */
type Target =
  | { kind: 'loose'; loose: Loose; dist: number }
  | { kind: 'ghost'; v: ModVehicle; mount: MountDef; sub: string | null; replace: boolean; dist: number }
  | { kind: 'looseSub'; loose: Loose; sub: string; dist: number }
  | { kind: 'part'; v: ModVehicle; mount: MountDef; dist: number }
  | { kind: 'pour'; v: ModVehicle; dist: number }
  | { kind: 'surface'; v: ModVehicle; mount: MountDef | null; dist: number }
  | { kind: 'enter'; v: ModVehicle; dist: number }
  | { kind: 'device'; device: GarageDevice; dist: number };

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
}

const REACH = 2.6;
const GHOST_RANGE = 4.2;
/** angle (rad) within which the mark picks a ghost */
const GHOST_CONE = 0.2;
const DROP_HOLD = 0.45;

export class ModPlayer {
  readonly walker: FootWalker;
  readonly solids = new SolidSet();
  readonly input: FootInput = { forward: 0, right: 0, run: false, crouch: false, jump: false };
  held: Held = null;
  target: Target | null = null;
  readonly ghosts = new GhostLayer();
  /** assists: the holograms, the stat card (the ghosts' targeting works without them) */
  showGhostsOn = true;
  showCardOn = true;
  /** the colour a spray can is set to */
  paintIndex = 3;
  /** progress of the hold in hand (0…1), and what it is for (a target key) */
  progress = 0;
  private progressKey = '';
  private surfaceT = 0;
  private dropT = 0;
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

  constructor(
    land: Land,
    private readonly host: PlayerHost,
  ) {
    this.walker = new FootWalker(land, this.solids);
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
    }
  }

  // ------------------------------------------------------------------ every frame on foot

  update(dt: number, lookYaw: number, lookPitch: number, keys: { run: boolean; jump: boolean; drop: boolean; take: boolean; forward: number; right: number }): void {
    const w = this.walker;
    this.input.forward = keys.forward;
    this.input.right = keys.right;
    this.input.run = keys.run;
    this.input.jump = keys.jump;
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
      // a tyre onto a rim lying about
      if (sub === 'tire') {
        const r = this.host.loose.pick(this.eye, this.dir, REACH, (l) => !!l.part && !!partDef(l.part.part).rim?.tire && !l.part.sub.tire);
        if (r && (!best || r.dist < best.dist)) best = { kind: 'looseSub', loose: r.loose, sub: 'tire', dist: r.dist };
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
      // with something in the hands a door or a lid can still be opened
      for (const v of this.near(REACH + 1)) {
        for (const m of v.view.frame.mounts) {
          if (!v.build.parts[m.id] || !v.view.hasPanel(m.id)) continue;
          const b = v.view.boundsOf(m.id, this.box);
          if (!b) continue;
          const p = this.ray.intersectBox(b, this.hit);
          if (!p) continue;
          const d = p.distanceTo(this.ray.origin);
          if (d <= REACH) better({ kind: 'part', v, mount: m, dist: d });
        }
      }
      if (best) return best;
    }

    // empty hands: things lying about
    if (!held) {
      const r = this.host.loose.pick(this.eye, this.dir, REACH);
      if (r) better({ kind: 'loose', loose: r.loose, dist: r.dist });
    }
    // parts on vehicles (empty hands: to take off; a spray can or sponge: to work on)
    const working = held?.kind === 'tool' && (held.tool.kind === 'spray' || held.tool.kind === 'sponge');
    for (const v of this.near(REACH + 1)) {
      let onPart = false;
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
      // the body itself: get in, pour, or paint and wash the frame
      const sd = v.solid.update();
      const c = this.v3.set(sd.x - o.x, (sd.y0 + sd.y1) / 2 - o.y, sd.z - o.z);
      // the body box, turned to the vehicle's heading: test in its own frame
      const cos = Math.cos(-sd.yaw);
      const sin = Math.sin(-sd.yaw);
      const ox = this.ray.origin.x - c.x;
      const oz = this.ray.origin.z - c.z;
      const lo = new THREE.Vector3(ox * cos - oz * sin, this.ray.origin.y - c.y, ox * sin + oz * cos);
      const ld = new THREE.Vector3(this.ray.direction.x * cos - this.ray.direction.z * sin, this.ray.direction.y, this.ray.direction.x * sin + this.ray.direction.z * cos);
      const hb = new THREE.Box3(new THREE.Vector3(-sd.hx, -(sd.y1 - sd.y0) / 2, -sd.hz), new THREE.Vector3(sd.hx, (sd.y1 - sd.y0) / 2, sd.hz));
      const hp = new THREE.Ray(lo, ld).intersectBox(hb, this.hit);
      if (!hp) continue;
      const d = hp.distanceTo(lo);
      if (d > REACH + 0.4) continue;
      if (held?.kind === 'tool') {
        const use = toolUse(held.tool, v.build);
        if (use.where === 'any') better({ kind: 'surface', v, mount: null, dist: d + 0.05 });
        else better({ kind: 'pour', v, dist: d });
        // (the body's box is coarse: a part the mark is on wins, an open bonnet standing well inside it too)
      } else if (!held && !onPart) better({ kind: 'enter', v, dist: d + 0.25 });
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
      case 'pour':
      case 'enter':
        return `${t.kind}:${t.v.build.uid}`;
      case 'device':
        return `device:${t.device.id}`;
    }
  }

  private act(dt: number, dropKey: boolean): void {
    const t = this.target;
    const key = this.keyOf(t);
    const host = this.host;
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
      if (t.kind === 'loose' && !this.held) {
        host.loose.remove(t.loose);
        this.held = t.loose.part ? { kind: 'part', inst: t.loose.part } : { kind: 'tool', tool: t.loose.tool! };
        if (this.held.kind === 'tool' && this.held.tool.kind === 'spray') this.paintIndex = this.held.tool.colour ?? this.paintIndex;
        host.sound('pickup', partMass(this.held));
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
      if (t.kind === 'ghost' && (moving(t.v) || t.v.view.shutOver(t.mount.id))) {
        this.progress = 0;
        return;
      }
      const need = installSeconds(partDef(held.inst.part));
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
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
      if (moving(t.v) || t.v.view.shutOver(t.mount.id)) {
        this.progress = 0;
        return;
      }
      const need = installSeconds(partDef(t.v.build.parts[t.mount.id].part));
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
        const inst = removePart(t.v.build, t.mount.id);
        if (inst) {
          this.held = { kind: 'part', inst };
          host.changed(t.v, `off:${t.mount.id}`);
          host.sound('remove_done', partDef(inst.part).mass);
        }
      }
      return;
    }
    if (t.kind === 'loose' && !held && this.secondary && t.loose.part?.sub.tire) {
      // a tyre off a wheel lying about
      this.progress += dt / 1.2;
      if (this.progress >= 1) {
        this.progress = 0;
        const tyre = removeSub(t.loose.part, 'tire');
        const l = t.loose;
        host.loose.remove(l);
        host.loose.addPart(l.part!, l.x, l.y, l.z, l.yaw).resting = true;
        if (tyre) this.held = { kind: 'part', inst: tyre };
      }
      return;
    }
    if (t.kind === 'pour' && held?.kind === 'tool' && this.primary) {
      const moved = pour(held.tool, t.v.build, dt);
      if (moved > 0) {
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

  private ui(): void {
    const ui = this.host.ui;
    const t = this.target;
    const held = this.held;
    const name = (inst: PartInstance): string => partDef(inst.part).name[ui.lang];
    let word = '';
    let card: Parameters<ModUI['showCard']>[0] = null;
    if (t) {
      switch (t.kind) {
        case 'loose':
          word = t.loose.part ? `拿起 <b>${name(t.loose.part)}</b>${t.loose.part.sub.tire ? '<small>按住右键 拆下轮胎</small>' : ''}` : `拿起 <b>${toolName(t.loose.tool!)}</b>`;
          break;
        case 'looseSub':
          word = `装到 <b>${name(t.loose.part!)}</b> 上<small>按住 E</small>`;
          break;
        case 'ghost': {
          if (held?.kind !== 'part') break;
          const inst = held.inst;
          const verb = t.replace ? '替换' : '装上';
          if (moving(t.v)) {
            word = `<b>${name(inst)}</b> · 车在动，停下再装`;
            card = { ...this.card(t.v, t.mount, t.sub, inst)!, warn: '车在动：先停稳、拉手刹' };
            break;
          }
          const lid = t.v.view.shutOver(t.mount.id);
          if (lid) {
            const what = t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? '';
            word = `<b>${name(inst)}</b> · 先打开${what}`;
            card = { ...this.card(t.v, t.mount, t.sub, inst)!, warn: `${what}关着：看着它按 E 打开` };
            break;
          }
          word = `${verb} <b>${name(inst)}</b> · ${t.mount.label[ui.lang]}<small>按住 E / 左键</small>`;
          card = this.card(t.v, t.mount, t.sub, inst);
          break;
        }
        case 'part': {
          const inst = t.v.build.parts[t.mount.id];
          const panel = t.v.view.hasPanel(t.mount.id);
          const seat = t.mount.cat === 'seat' || t.mount.cat === 'steering';
          const e = panel ? (t.v.view.panelOpen(t.mount.id) > 0.5 ? '关上' : '打开') : seat ? '上车' : '';
          const lid = t.v.view.shutOver(t.mount.id);
          const how = moving(t.v) ? '车在动' : lid ? `先打开${t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? ''}` : held ? '' : '按住右键 拆下';
          word = `${e ? `${e} · ` : ''}<b>${name(inst)}</b>${how ? `<small>${how}</small>` : ''}`;
          const def = partDef(inst.part);
          card = { title: def.name[ui.lang], sub: `${def.mass} kg · 车况 ${(inst.cond * 100).toFixed(0)}% · ${t.mount.label[ui.lang]}`, lines: [] };
          break;
        }
        case 'pour': {
          if (held?.kind !== 'tool') break;
          const use = toolUse(held.tool, t.v.build);
          word = use.can ? `${use.word[ui.lang]}<small>按住 E</small>` : `${use.word[ui.lang]}：${use.why?.[ui.lang] ?? ''}`;
          break;
        }
        case 'surface': {
          if (held?.kind !== 'tool') break;
          const tool = held.tool;
          const what = t.mount ? name(t.v.build.parts[t.mount.id]) : t.v.view.frame.name[ui.lang];
          word = `${tool.kind === 'spray' ? '喷漆' : '擦洗'} <b>${what}</b><small>按住左键${tool.kind === 'spray' ? ' · 滚轮换色' : ''}</small>`;
          break;
        }
        case 'enter':
          word = `上车 <b>${t.v.view.frame.name[ui.lang]}</b>`;
          break;
        case 'device':
          word = t.device.word[ui.lang];
          break;
      }
    }
    if (this.dropT > 0 && held) word = '放下';
    const ring = this.dropT > 0 && held ? Math.min(1, this.dropT / DROP_HOLD) : this.progress > 0 ? this.progress : -1;
    ui.prompt(true, word, ring);
    ui.showCard(this.showCardOn ? card : null);
    if (held) {
      const label = held.kind === 'part' ? `${name(held.inst)}<small>${partDef(held.inst.part).mass} kg · 按住 G 放下</small>` : `${toolName(held.tool)}<small>按住 G 放下</small>`;
      ui.showHeld(label);
    } else ui.showHeld(null);
    ui.showPaint(held?.kind === 'tool' && held.tool.kind === 'spray' ? PALETTE.map((p) => p.hex) : null, this.paintIndex);
  }

  /** the stat card: this vehicle now, and with the held part on that mount (cached while aimed) */
  private card(v: ModVehicle, mount: MountDef, sub: string | null, inst: PartInstance): Parameters<ModUI['showCard']>[0] {
    const key = `${v.build.uid}:${mount.id}:${sub ?? ''}:${inst.uid}:${v.sys.derived.mass.toFixed(1)}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      const before = quickPerf(v.sys.derived);
      const after = perfWith(v.build, mount.id, inst, sub);
      this.cardCache = compare(before, after);
    }
    const def = partDef(inst.part);
    return {
      title: def.name[this.host.ui.lang],
      sub: `${def.mass} kg · 车况 ${(inst.cond * 100).toFixed(0)}% · ${mount.label[this.host.ui.lang]}`,
      lines: this.cardCache ?? [],
    };
  }

  telemetry(): Record<string, string | number | boolean> {
    const t = this.target;
    return {
      held: this.held ? (this.held.kind === 'part' ? this.held.inst.part : `tool:${this.held.tool.kind}`) : '',
      target: this.keyOf(t),
      progress: this.progress,
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
