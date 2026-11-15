/**
 * Looking at things and using them (docs/DESIGN_V2.md 6.3): everything one can use — a crate, a
 * can on the ground, a fuel tank, a door of the vehicle, later a fishing spot or a stove — is an
 * `Interactable`, offered by an `InteractSource`. The pick takes what is within 2.2 m and 9° of the
 * view ray (nearest wins, solids in between block it); E uses it — a press, or a hold that fills a
 * ring (0.6–2.5 s), released early it is cancelled. Under the crosshair there is one word.
 *
 * Every use is also an event (10.3): a host can replay it on the same interactable by its stable id.
 */
import type { Carrier } from '../items/carry';
import type { Solid, SolidSource } from '../world/solids';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** someone using things: a carrier with an eye */
export interface Actor extends Carrier {
  /** eye point (world) */
  readonly eye: Vec3;
  /** heading on the plan (solids' convention: facing (cos h, sin h)) */
  readonly heading: number;
}

/** a second, longer hold on the same thing: "take all" on a crate's contents */
export interface LongUse {
  readonly hold: number;
  prompt(actor: Actor): string | null;
  act(actor: Actor): boolean;
}

export interface Interactable {
  /** stable across sessions and machines (a site's thing: `${siteId}:${n}`) */
  readonly id: string;
  /** the point looked at (world); fills out, allocates nothing */
  aim(out: Vec3): void;
  /** how big it is to the eye (m) */
  readonly radius: number;
  /** the one word under the crosshair; null = nothing to do with it now (it is not picked) */
  prompt(actor: Actor): string | null;
  /** seconds E must be held (0 = a press) */
  readonly hold: number;
  act(actor: Actor): boolean;
  /** optional: held longer, something else happens (on release before it, `act` happens) */
  readonly long?: LongUse;
  /** optional: something that goes on while E is held (siphoning, pouring); false = it has finished */
  channel?(actor: Actor, dt: number): boolean;
  /** optional: 0…1 for the ring while channelling */
  progress?(actor: Actor): number;
  /** optional: the tag of a solid the view may pass through to reach it (the crate its things lie in) */
  readonly through?: string;
}

export interface InteractSource {
  /** append everything usable whose aim point is within r of (x, z) on the plan */
  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void;
}

/** several sources asked as one */
export class InteractSet implements InteractSource {
  private readonly sources: InteractSource[] = [];
  private readonly tmp: Interactable[] = [];

  add(s: InteractSource): void {
    if (!this.sources.includes(s)) this.sources.push(s);
  }

  remove(s: InteractSource): void {
    const i = this.sources.indexOf(s);
    if (i >= 0) this.sources.splice(i, 1);
  }

  interactablesNear(x: number, z: number, r: number, out: Interactable[]): void {
    for (const s of this.sources) s.interactablesNear(x, z, r, out);
  }

  /** the interactable with this id near (x, z) (replaying an event) */
  find(id: string, x: number, z: number, r = 8): Interactable | null {
    this.tmp.length = 0;
    this.interactablesNear(x, z, r, this.tmp);
    for (const i of this.tmp) if (i.id === id) return i;
    return null;
  }
}

export const PICK_RANGE = 2.2;
export const PICK_CONE_DEG = 9;
/** the shortest and longest hold (s) */
export const HOLD_MIN = 0.6;
export const HOLD_MAX = 2.5;

/** the hold an interactable really asks for: 0, or within 0.6–2.5 s */
export function holdOf(h: number): number {
  return h <= 0 ? 0 : h < HOLD_MIN ? HOLD_MIN : h > HOLD_MAX ? HOLD_MAX : h;
}

/** does the segment a→b pass through a solid (an upright box; a post is taken as its square)? */
export function segmentHits(s: Solid, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const c = Math.cos(s.yaw);
  const sn = Math.sin(s.yaw);
  const hx = s.hx;
  const hz = s.hz === 0 ? s.hx : s.hz;
  // into the box's frame: u along, v across
  const au = (ax - s.x) * c + (az - s.z) * sn;
  const av = -(ax - s.x) * sn + (az - s.z) * c;
  const bu = (bx - s.x) * c + (bz - s.z) * sn;
  const bv = -(bx - s.x) * sn + (bz - s.z) * c;
  let t0 = 0;
  let t1 = 1;
  const slab = (a: number, b: number, lo: number, hi: number): boolean => {
    const d = b - a;
    if (Math.abs(d) < 1e-12) return a >= lo && a <= hi;
    let ta = (lo - a) / d;
    let tb = (hi - a) / d;
    if (ta > tb) {
      const t = ta;
      ta = tb;
      tb = t;
    }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    return t0 <= t1;
  };
  return slab(au, bu, -hx, hx) && slab(av, bv, -hz, hz) && slab(ay, by, s.y0, s.y1);
}

/** chooses what is looked at */
export class Picker {
  range = PICK_RANGE;
  cone = (PICK_CONE_DEG * Math.PI) / 180;
  /** what the last pick found: its distance and how far off the ray it was (rad) */
  dist = 0;
  miss = 0;
  private readonly list: Interactable[] = [];
  private readonly solids: Solid[] = [];
  private readonly p: Vec3 = { x: 0, y: 0, z: 0 };

  /**
   * The interactable looked at from `eye` along the unit direction `dir`, or null.
   * Among those within range and cone, one the ray passes through beats one it only passes near;
   * then the nearest wins. A solid between the eye and it hides it.
   */
  pick(src: InteractSource, blockers: SolidSource | null, actor: Actor, eye: Vec3, dir: Vec3): Interactable | null {
    const list = this.list;
    list.length = 0;
    src.interactablesNear(eye.x, eye.z, this.range + 1, list);
    if (list.length === 0) return null;
    if (blockers) {
      this.solids.length = 0;
      blockers.solidsNear(eye.x, eye.z, this.range + 0.5, this.solids);
    }
    let best: Interactable | null = null;
    let bestKey = Infinity;
    let bestD = 0;
    let bestM = 0;
    const p = this.p;
    for (const it of list) {
      it.aim(p);
      const vx = p.x - eye.x;
      const vy = p.y - eye.y;
      const vz = p.z - eye.z;
      const d = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const r = it.radius;
      if (d - r > this.range) continue;
      let miss = 0;
      let key: number;
      if (d > r) {
        const along = (vx * dir.x + vy * dir.y + vz * dir.z) / d;
        const ang = Math.acos(along > 1 ? 1 : along < -1 ? -1 : along);
        miss = Math.max(0, ang - Math.asin(r / d));
        if (miss > this.cone) continue;
        key = miss === 0 ? d - r : 100 + miss * 10 + d * 0.01;
      } else key = 0;
      if (key >= bestKey) continue;
      if (it.prompt(actor) === null && !(it.long && it.long.prompt(actor) !== null)) continue;
      if (blockers && this.blocked(it, eye, p, d)) continue;
      best = it;
      bestKey = key;
      bestD = d;
      bestM = miss;
    }
    this.dist = bestD;
    this.miss = bestM;
    return best;
  }

  private blocked(it: Interactable, eye: Vec3, p: Vec3, d: number): boolean {
    // stop short of it by its size: its own body is not in the way of itself
    const k = d > 1e-6 ? Math.max(0, d - it.radius) / d : 0;
    const bx = eye.x + (p.x - eye.x) * k;
    const by = eye.y + (p.y - eye.y) * k;
    const bz = eye.z + (p.z - eye.z) * k;
    for (const s of this.solids) {
      if (it.through && s.tag === it.through) continue;
      // the box it sits in is not between the eye and it
      if (p.y >= s.y0 && p.y <= s.y1 && segmentHits(s, p.x, p.y, p.z, p.x, p.y, p.z)) continue;
      if (segmentHits(s, eye.x, eye.y, eye.z, bx, by, bz)) return true;
    }
    return false;
  }
}

export type UseVerb = 'act' | 'long' | 'channel';

/** one use of one thing by one actor: what a client would send to the host */
export interface UseEvent {
  actor: string;
  target: string;
  verb: UseVerb;
  /** seconds of channelling this event stands for */
  dt: number;
}

/** replay an event (the host side): false when the thing is not there or refused */
export function applyUse(src: InteractSet, actor: Actor, e: UseEvent): boolean {
  const it = src.find(e.target, actor.eye.x, actor.eye.z);
  if (!it) return false;
  if (e.verb === 'act') return it.act(actor);
  if (e.verb === 'long') return it.long ? it.long.act(actor) : false;
  return it.channel ? it.channel(actor, e.dt) : false;
}

/** a press of E before this long is a tap (for things that also have a long hold) */
export const TAP = 0.25;

/**
 * E over time: press, hold, release. Feed it every frame with what is looked at and whether E is
 * down; it acts (and reports the event) at the right moment and tells the HUD what to show.
 */
export class UseDriver {
  /** what is being held on (null = nothing) */
  target: Interactable | null = null;
  held = 0;
  /** for the HUD: the ring (0…1, < 0 = no ring) and the word */
  ring = -1;
  word: string | null = null;
  /** true: act here (single player, or the host); false: only report the events */
  local = true;
  private wasDown = false;
  /** waits for E to be let go before anything new starts */
  private spent = false;
  private readonly listeners: ((e: UseEvent) => void)[] = [];

  onUse(fn: (e: UseEvent) => void): void {
    this.listeners.push(fn);
  }

  private fire(actor: Actor, it: Interactable, verb: UseVerb, dt: number): boolean {
    const e: UseEvent = { actor: actor.id, target: it.id, verb, dt };
    for (const fn of this.listeners) fn(e);
    if (!this.local) return true;
    if (verb === 'act') return it.act(actor);
    if (verb === 'long') return it.long ? it.long.act(actor) : false;
    return it.channel ? it.channel(actor, dt) : false;
  }

  /** @returns true on the frame something was done */
  update(dt: number, looked: Interactable | null, down: boolean, actor: Actor): boolean {
    const pressed = down && !this.wasDown;
    const released = !down && this.wasDown;
    this.wasDown = down;
    let did = false;
    if (!down) this.spent = false;
    const t = this.target;
    if (t && (t !== looked || released)) {
      // let go (or looked away): a tap on something with a long hold is its press
      if (released && t === looked && t.long && this.held < holdOf(t.long.hold)) did = this.fire(actor, t, 'act', 0);
      this.target = null;
      this.held = 0;
    }
    if (pressed && looked && !this.spent && !this.target) {
      const h = holdOf(looked.hold);
      if (looked.channel || looked.long || h > 0) {
        this.target = looked;
        this.held = 0;
      } else {
        did = this.fire(actor, looked, 'act', 0);
        this.spent = true;
      }
    }
    const c = this.target;
    if (c && down) {
      this.held += dt;
      if (c.channel) {
        if (!this.fire(actor, c, 'channel', dt)) {
          this.target = null;
          this.spent = true;
        }
        did = true;
      } else if (c.long) {
        if (this.held >= holdOf(c.long.hold)) {
          did = this.fire(actor, c, 'long', 0);
          this.target = null;
          this.spent = true;
        }
      } else if (this.held >= holdOf(c.hold)) {
        did = this.fire(actor, c, 'act', 0);
        this.target = null;
        this.spent = true;
      }
    }
    // what the HUD shows
    const cur = this.target;
    if (cur) {
      if (cur.channel) {
        this.ring = cur.progress ? cur.progress(actor) : 0;
        this.word = cur.prompt(actor);
      } else if (cur.long) {
        const lh = holdOf(cur.long.hold);
        this.ring = this.held > TAP ? Math.min(1, this.held / lh) : -1;
        this.word = this.held > TAP ? cur.long.prompt(actor) : cur.prompt(actor);
      } else {
        this.ring = Math.min(1, this.held / holdOf(cur.hold));
        this.word = cur.prompt(actor);
      }
    } else {
      this.ring = -1;
      this.word = looked ? (looked.prompt(actor) ?? looked.long?.prompt(actor) ?? null) : null;
    }
    return did;
  }

  cancel(): void {
    this.target = null;
    this.held = 0;
    this.spent = true;
  }
}
