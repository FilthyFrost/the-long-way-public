/**
 * The ND ladders in the game (docs/ND/PLAN.md, ND6; the rules: core/v3/nd/climb.ts, as Nomad Drive's PlayerLadderClimb
 * has them):
 *
 *  - The ladders of the buildings nd-build draws (their cards' `ladders`: a water tower's). No key and nothing on
 *    screen: walking into one while facing it takes hold of it; at its head, with one's back to it, walking on over the
 *    edge takes hold of it from above, turned round to face it.
 *  - On it the walking keys (or the stick) go up and down its line, leaning as it leans, two metres a second; the view
 *    is turned to face it (looking up and down as ever); a rung's sound every 0.45 m, of iron or of wood as it is.
 *  - Past its head one is drawn onto the platform (0.3 s) and let go; at its foot walking back puts one on the ground;
 *    jumping lets go anywhere. Half a second before it is taken hold of again. In a seat, or put somewhere else by
 *    something else, one is off it.
 *  - Ladders that are not a building's come from their sources (`sources`: a vehicle's ladder, v3/ladder — J9e), asked
 *    each frame where they are now: one is climbed the same way, its line followed as it is now, and let go of when its
 *    source has it no longer (the vehicle moved off). The source is told as one takes hold and lets go.
 */
import * as THREE from 'three';
import type { System } from '../../../../core/kernel/systems';
import { ND_BUILDINGS, type CardLadder } from '../../../../core/v3/nd/cards';
import { CLIMB, climbAlong, takesHold } from '../../../../core/v3/nd/climb';
import type { Site, SiteObject } from '../../../../core/world/sites';
import type { Action } from '../../hudItems';
import type { GameContext } from '../../kernel/context';
import type { BuildingWatch, NdBuildings } from '../nd-build/system';

/** a ladder that is not a building's (a vehicle's: v3/ladder), as it stands now (world) */
export interface LadderNow {
  /** the same while it is the same ladder */
  readonly key: string;
  readonly name: string;
  /** the feet's line at its foot and at its head, and where one is let go at its head */
  readonly foot: { readonly x: number; readonly y: number; readonly z: number };
  readonly head: { readonly x: number; readonly y: number; readonly z: number };
  readonly exit: { readonly x: number; readonly y: number; readonly z: number };
  /** the way one faces it (a walker's heading) */
  readonly face: number;
  /** its rungs of wood (else of metal: their sound) */
  readonly wood?: boolean;
}

/** where ladders that are not a building's come from (NdClimb.sources) */
export interface LadderSource {
  /** the ladders it has that may be climbed now, appended to `out` */
  ladders(out: LadderNow[]): void;
  /** one took hold of one of them */
  took?(key: string): void;
  /** one let go of it: drawn off at its head, off at its foot, jumped off, or it went (moved off, one put somewhere else) */
  left?(key: string, how: 'head' | 'foot' | 'jump' | 'gone'): void;
}

interface Ladder {
  site: string;
  card: CardLadder;
  /** a source's ladder (not a building's): where it comes from, and its key there */
  src?: LadderSource;
  key?: string;
  /** the feet at its foot and at its head (world), its line's length and direction */
  f0: THREE.Vector3;
  f1: THREE.Vector3;
  len: number;
  dir: THREE.Vector3;
  /** where one is let go at its head (world) */
  exit: THREE.Vector3;
  /** the way one faces it (a walker's heading) and that way on the plan */
  face: number;
  fx: number;
  fz: number;
  /** its rungs' sound (core/audio/footing.ts: `<site>:tank` iron, `<site>:porch` wood) */
  tag: string;
}

interface Climb {
  l: Ladder;
  phase: 'grab' | 'on' | 'off';
  t: number;
  /** how far along its line (0 its foot, len its head) */
  s: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** the turn at taking hold, and the turn it ends at */
  yaw0: number;
  /** taken hold of from above: the forward key does nothing until it has been let up */
  latched: boolean;
  /** how far climbed since the last rung's sound */
  acc: number;
}

function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export class NdClimb implements System<GameContext>, BuildingWatch {
  readonly id = 'nd-climb';
  readonly budget = { cpuMs: 0.1 };
  private ctx: GameContext | null = null;
  private readonly ladders = new Map<string, Ladder[]>();
  private climb: Climb | null = null;
  private cool = 0;
  private readonly words: Action[] = [
    { keys: ['W'], text: '上' },
    { keys: ['S'], text: '下' },
    { keys: ['Space'], text: '松手' },
  ];
  private readonly pin = { x: 0, y: 0, z: 0, eye: CLIMB.eye, words: this.words as readonly Action[] };
  private readonly v = new THREE.Vector3();
  /** rungs' sounds made, climbs begun (the probes') */
  private rungs = 0;
  private grabs = 0;
  /** where the ladders that are not a building's come from (a vehicle's: v3/ladder); asked each frame */
  readonly sources: LadderSource[] = [];
  /** (what the sources said this frame, and each of their ladders as climbed, by key: made once) */
  private readonly found: LadderNow[] = [];
  private readonly moving = new Map<string, Ladder>();

  constructor(private readonly buildings: NdBuildings) {
    buildings.watchers.push(this);
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
  }

  // ------------------------------------------------------------------ the ladders of the sources (a vehicle's)

  /** a source's ladder as it stands now, in the shape a building's has (its own object, kept by key and brought up to date) */
  private ladderNow(n: LadderNow, src: LadderSource): Ladder {
    let l = this.moving.get(n.key);
    if (!l) {
      const card: CardLadder = { name: n.name, foot: { u: 0, v: 0, y: 0 }, head: { u: 0, v: 0, y: 0 }, exit: { u: 0, v: 0, y: 0 }, yaw: 0, w: 0.3, wood: n.wood };
      l = { site: `@${n.key}`, card, src, key: n.key, f0: new THREE.Vector3(), f1: new THREE.Vector3(), len: 0, dir: new THREE.Vector3(), exit: new THREE.Vector3(), face: 0, fx: 1, fz: 0, tag: `${n.key}:${n.wood ? 'porch' : 'tank'}` };
      this.moving.set(n.key, l);
    }
    l.src = src;
    l.f0.set(n.foot.x, n.foot.y, n.foot.z);
    l.f1.set(n.head.x, n.head.y, n.head.z);
    l.dir.copy(l.f1).sub(l.f0);
    l.len = l.dir.length();
    l.dir.normalize();
    l.exit.set(n.exit.x, n.exit.y, n.exit.z);
    l.face = n.face;
    l.fx = Math.cos(n.face);
    l.fz = Math.sin(n.face);
    return l;
  }

  /** a source's ladder climbed now, as it is this frame; false: its source has it no longer */
  private refresh(l: Ladder): boolean {
    const src = l.src;
    if (!src) return true;
    const out = this.found;
    out.length = 0;
    src.ladders(out);
    for (let i = 0; i < out.length; i++) {
      if (out[i].key !== l.key) continue;
      this.ladderNow(out[i], src);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ the ladders of the buildings drawn

  dressed(site: Site): void {
    const cards = ND_BUILDINGS[site.prefab]?.geo.ladders;
    const o = site.objects.find((x) => x.kind === 'prefab');
    if (!cards?.length || !o) return;
    this.ladders.set(site.id, cards.map((c) => this.ladderOf(site, o, c)));
  }

  dropped(site: string): void {
    if (this.climb?.l.site === site) this.letGo();
    this.ladders.delete(site);
  }

  private ladderOf(site: Site, o: SiteObject, c: CardLadder): Ladder {
    const co = Math.cos(o.yaw);
    const si = Math.sin(o.yaw);
    const w = (p: { u: number; v: number; y: number }): THREE.Vector3 => new THREE.Vector3(o.x + co * p.u - si * p.v, o.y + p.y, o.z + si * p.u + co * p.v);
    const f0 = w(c.foot);
    const f1 = w(c.head);
    const d = f1.clone().sub(f0);
    const face = o.yaw + c.yaw;
    return {
      site: site.id,
      card: c,
      f0,
      f1,
      len: d.length(),
      dir: d.normalize(),
      exit: w(c.exit),
      face,
      fx: Math.cos(face),
      fz: Math.sin(face),
      tag: `${site.id}:${c.wood ? 'porch' : 'tank'}`,
    };
  }

  // ------------------------------------------------------------------ on and off

  private start(l: Ladder, from: 'foot' | 'head'): void {
    const ctx = this.ctx!;
    const w = ctx.player.walker;
    // (from below: the nearest point of its line; from above: its head)
    const s = from === 'head' ? l.len : Math.max(0, Math.min(l.len, this.v.set(w.x, w.y, w.z).sub(l.f0).dot(l.dir)));
    const to = l.f0.clone().addScaledVector(l.dir, s);
    this.climb = { l, phase: 'grab', t: 0, s, from: new THREE.Vector3(w.x, w.y, w.z), to, yaw0: ctx.input.lookYaw, latched: from === 'head', acc: 0 };
    this.pin.x = w.x;
    this.pin.y = w.y;
    this.pin.z = w.z;
    ctx.player.pin = this.pin;
    this.grabs++;
    ctx.sound('latch', 0.45);
    if (l.src && l.key) l.src.took?.(l.key);
  }

  private letGo(how: 'head' | 'foot' | 'jump' | 'gone' = 'gone'): void {
    const ctx = this.ctx;
    const l = this.climb?.l;
    this.climb = null;
    this.cool = CLIMB.cooldownS;
    if (ctx && ctx.player.pin === this.pin) ctx.player.pin = null;
    if (l?.src && l.key) l.src.left?.(l.key, how);
  }

  /** walking into a ladder, facing it (or with one's back to it at its head): taking hold of it */
  private reach(ctx: GameContext): void {
    if (this.cool > 0 || ctx.seated || ctx.player.pin || (this.ladders.size === 0 && this.sources.length === 0)) return;
    const fwd = ctx.input.walk.forward;
    if (fwd < CLIMB.grabInput) return;
    const w = ctx.player.walker as unknown as { x: number; y: number; z: number; heading: number; grounded?: boolean; crouched?: boolean };
    if (w.grounded === false || w.crouched) return;
    const hx = Math.cos(ctx.input.lookYaw);
    const hz = Math.sin(ctx.input.lookYaw);
    for (const list of this.ladders.values()) {
      for (const l of list) {
        if (this.tryHold(l, w, hx, hz, fwd)) return;
      }
    }
    // (and the sources' ladders, as they stand now)
    for (const src of this.sources) {
      const out = this.found;
      out.length = 0;
      src.ladders(out);
      for (let i = 0; i < out.length; i++) if (this.tryHold(this.ladderNow(out[i], src), w, hx, hz, fwd)) return;
    }
  }

  /** one walking (feet w, facing hx, hz, the stick forward fwd) takes hold of this ladder if it would (true: taken) */
  private tryHold(l: Ladder, w: { x: number; y: number; z: number }, hx: number, hz: number, fwd: number): boolean {
    // (the feet in its terms: along its line, out in front of it, to its side, up from its foot)
    const along = this.v.set(w.x, w.y, w.z).sub(l.f0).dot(l.dir);
    const sa = Math.max(0, Math.min(l.len, along));
    const px = l.f0.x + l.dir.x * sa;
    const pz = l.f0.z + l.dir.z * sa;
    const dx = w.x - px;
    const dz = w.z - pz;
    // (in front of it is against the way one faces it)
    const out = -(dx * l.fx + dz * l.fz);
    const side = dx * -l.fz + dz * l.fx;
    const from = takesHold({ out, side, along, len: l.len, up: w.y - l.f0.y, top: l.f1.y - l.f0.y, facing: hx * l.fx + hz * l.fz, forward: fwd });
    if (!from) return false;
    this.start(l, from);
    return true;
  }

  /** before the walk: taking hold, the feet held on its line where the climb has them, the view turned to it */
  preStep(dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.cool = Math.max(0, this.cool - dt);
    const c = this.climb;
    if (!c) {
      this.reach(ctx);
      return;
    }
    // (taken into a seat, put somewhere else by something else, the pin someone else's: off it)
    if (ctx.seated || ctx.player.pin !== this.pin) {
      const l = c.l;
      this.climb = null;
      this.cool = CLIMB.cooldownS;
      if (l.src && l.key) l.src.left?.(l.key, 'gone');
      return;
    }
    const l = c.l;
    // (a source's ladder followed as it stands now; gone from its source — the vehicle moved off — one lets go)
    if (!this.refresh(l)) {
      this.letGo('gone');
      return;
    }
    const inp = ctx.input;
    c.t += dt;
    if (c.phase === 'grab') {
      const k = Math.min(1, c.t / CLIMB.grabS);
      this.pin.x = c.from.x + (c.to.x - c.from.x) * k;
      this.pin.y = c.from.y + (c.to.y - c.from.y) * k;
      this.pin.z = c.from.z + (c.to.z - c.from.z) * k;
      inp.lookYaw = c.yaw0 + wrapPi(l.face - c.yaw0) * k;
      if (k >= 1) {
        c.phase = 'on';
        c.t = 0;
      }
      return;
    }
    if (c.phase === 'off') {
      const k = Math.min(1, c.t / CLIMB.releaseS);
      this.pin.x = c.from.x + (c.to.x - c.from.x) * k;
      this.pin.y = c.from.y + (c.to.y - c.from.y) * k;
      this.pin.z = c.from.z + (c.to.z - c.from.z) * k;
      if (k >= 1) this.letGo('head');
      return;
    }
    inp.lookYaw = l.face;
    // jumping lets go: one drops where one is
    if (inp.isDown('Space')) {
      this.letGo('jump');
      return;
    }
    let fwd = inp.walk.forward;
    if (c.latched) {
      if (fwd <= CLIMB.dead) c.latched = false;
      else if (fwd > 0) fwd = 0;
    }
    const was = c.s;
    const step = climbAlong(c.s, fwd, dt, l.len);
    c.s = step.s;
    this.pin.x = l.f0.x + l.dir.x * c.s;
    this.pin.y = l.f0.y + l.dir.y * c.s;
    this.pin.z = l.f0.z + l.dir.z * c.s;
    // a rung's sound every 0.45 m climbed (none while hanging still)
    c.acc += Math.abs(c.s - was);
    if (c.acc >= CLIMB.rungSound) {
      c.acc %= CLIMB.rungSound;
      this.rungs++;
      const w = ctx.player.walker as unknown as { steps: number; floorTag: string };
      w.floorTag = l.tag;
      w.steps++;
    }
    if (step.off === 'head') {
      c.phase = 'off';
      c.t = 0;
      c.from.set(this.pin.x, this.pin.y, this.pin.z);
      c.to.copy(l.exit);
      ctx.sound('latch', 0.35);
    } else if (step.off === 'foot') this.letGo('foot');
  }

  // ------------------------------------------------------------------ the probes'

  telemetry(): Record<string, unknown> {
    return { ladders: [...this.ladders.values()].reduce((n, l) => n + l.length, 0), climbing: this.climb?.phase ?? null, grabs: this.grabs, rungs: this.rungs };
  }

  readonly harness = {
    /** the ladders drawn: their place, name, the feet at their foot and head, where one is let go (world) */
    ladders: (): { site: string; name: string; foot: number[]; head: number[]; exit: number[]; face: number }[] =>
      [...this.ladders.values()].flat().map((l) => ({ site: l.site, name: l.card.name, foot: l.f0.toArray(), head: l.f1.toArray(), exit: l.exit.toArray(), face: l.face })),
    /** the climb now: its phase, how far along, the rungs' sounds and the climbs so far; a source's ladder's key */
    state: (): { phase: string | null; s: number; len: number; rungs: number; grabs: number; key: string | null } => ({ phase: this.climb?.phase ?? null, s: this.climb?.s ?? 0, len: this.climb?.l.len ?? 0, rungs: this.rungs, grabs: this.grabs, key: this.climb?.l.key ?? null }),
  };

  dispose(): void {
    this.letGo();
    const i = this.buildings.watchers.indexOf(this);
    if (i >= 0) this.buildings.watchers.splice(i, 1);
  }
}
