/**
 * One cast after another (docs/V3/nodes/F2-fishing-lite.md §2, docs/V3/plan/fishing-fight.md): the state machine
 * between the angler's hands, the pond and the fight. The host tells it where the angler aims, whether the button is
 * down and where the rod is pulled, and steps it; it says what happened as events (for the picture, the sounds and
 * the words) and keeps its state where the views can read it.
 *
 *   idle      press to charge, let go to cast (the longer the press, the further, up to the rod's reach)
 *   flight    the float in the air; it lands with a splash that scares off any fish right under it (and a bait of
 *             a rarity with no fish of it in reach has one brought in near it: docs/V3/plan/fishing-feel.md §10)
 *   wait      fish notice the bait and come; a fish nibbles a time or two, then takes it: the float goes under
 *             press then to strike (early: the fish flees; late: it lets go); a quick tap with nothing there
 *             twitches the bait; a long press winds the bait back in; the view turned hard scares off a fish at it.
 *             A lure (docs/V3/plan/fishing-fight.md §5) is fished by winding it in: held, it swims back, the
 *             faster the longer it is held; only moving does it draw a hunter, which follows it — too fast and it
 *             is left behind, still too long and it loses interest; wound in evenly, or stopped short, it strikes
 *   fight     the rod pulled against the fish's run (`steer`), held to reel, let go to give line (fight.ts); brought
 *             to one's feet spent, a press lands it (landFish())
 *   reveal    the catch in the hands; the host ends it (kept, released, put on the hook alive)
 */
import { landFight, startFight, stepFight, fightParams, type FightEnd, type FightParams, type FishPhase, type FightState } from './fight';
import { FISH, fishOfTier } from './fish';
import { appetite, hasCharm, PERFECT_SHARE, rollLength, Stream, strikeWindow, type Rig } from './rules';
import type { Pond, PondFish } from './pond';
import { FAN } from './spots';
import type { Conditions, Junk } from './types';

export type Phase = 'idle' | 'charge' | 'flight' | 'wait' | 'fight' | 'reveal' | 'retrieve';

export interface Landed {
  uid: number;
  /** index into FISH (−1: junk) */
  fish: number;
  cm: number;
  kg: number;
  q: number;
  perfect: boolean;
  junk?: Junk;
  /** a second, small fish on the twin hook */
  bonus?: { fish: number; cm: number; kg: number; q: number };
  /** seconds the fight took */
  secs: number;
}

export type SessionEvent =
  | { type: 'cast'; x: number; z: number; dist: number }
  | { type: 'splash'; x: number; z: number; spooked: number }
  | { type: 'bank'; shallow: boolean }
  | { type: 'twitch' }
  | { type: 'come'; uid: number }
  | { type: 'follow'; uid: number }
  | { type: 'lostInterest'; uid: number; why: 'fast' | 'still' }
  | { type: 'spooked'; uid: number }
  | { type: 'nibble'; uid: number }
  | { type: 'bite'; uid: number; tier: number }
  | { type: 'early'; uid: number }
  | { type: 'miss'; uid: number }
  | { type: 'hook'; uid: number; tier: number; ratio: number; perfect: boolean; junk: boolean }
  | { type: 'tell'; next: FishPhase }
  | { type: 'phase'; phase: FishPhase }
  | { type: 'turn'; dir: number }
  | { type: 'bolt' }
  | { type: 'landable' }
  | { type: 'lost'; why: FightEnd; uid: number; fish: number }
  | { type: 'landed'; landed: Landed }
  | { type: 'retrieve' }
  | { type: 'nobody' }
  | { type: 'consume' };

/** what the host hands the session each step */
export interface SessionHost {
  rig(): Rig;
  /** the angler's level where the host keeps one (the first build's: the twitch comes at 3); without, the twitch is
   * there from the start (the game's fishing has no levels) */
  level?(): number;
}

const TICK = 0.25;
/** a lure wound in faster than this (m/s) leaves its hunter behind; the fastest it is wound in; the view turned faster than this (rad/s) scares a fish off a still bait */
const LURE_FAST = 1.55;
const LURE_MAX = 2.2;
const JIGGLE = 3.2;
const JUNKS: readonly [Junk, number][] = [
  ['boot', 0.3],
  ['can', 0.25],
  ['bottle', 0.25],
  ['crate', 0.15],
  ['pearl', 0.05],
];

export class Session {
  phase: Phase = 'idle';
  /** where the angler aims (rad in the pond's frame: 0 straight out along +z, + to the right), set by the host */
  aim = 0;
  /**
   * Where the angler stands in the pond's frame (m), set by the host: the end of the jetty is (0, 0), but one may
   * fish from anywhere along it or the shore (docs/V3/plan/fishing.md). The cast goes out from here, the fight is
   * the line between here and the fish, the float comes back here.
   */
  readonly angler = { x: 0, z: 0 };
  /** the aim is clamped to the fan out from the end of the jetty (the page that stood one there); the game lets one face any way */
  fan = true;
  /**
   * The water as the world has it (m of water at a point of the pond's frame), set by a host that knows: a float that
   * comes down beyond the pond's reach still lands in the lake there, and a fish on the line swims where the lake
   * is. Absent: the pond's own grid (a fish of the pond only ever keeps to it).
   */
  depthAt: ((x: number, z: number) => number) | null = null;

  private water(x: number, z: number): number {
    return this.depthAt ? this.depthAt(x, z) : this.pond.shape.depthAt(x, z);
  }
  /** 0 … 1 while charging */
  charge = 0;
  /** the float: where it is (local), where it flies from and to, whether it is down in the water */
  readonly float = { x: 0, z: 0, fromX: 0, fromZ: 0, toX: 0, toZ: 0, t: 0, dur: 0, wet: false, dip: 0 };
  /** seconds this cast has waited */
  waitT = 0;
  /** the fish that has noticed the bait (null: none yet) */
  committed: PondFish | null = null;
  /** a junk "bite" under way */
  junk: Junk | null = null;
  /** the fight under way */
  fight: FightState | null = null;
  fightP: FightParams | null = null;
  hooked: PondFish | null = null;
  perfect = false;
  /** the catch being held up */
  last: Landed | null = null;
  /** where the rod is pulled while a fish is on, −1 to the left … 1 to the right (set by the host: A/D, the mouse) */
  steer = 0;
  /** how fast the view turns, rad a second (set by the host): turned hard while a fish is at a still bait, it is scared off */
  jiggle = 0;
  /** a lure being wound in: how fast it swims back (m/s) */
  lureSpeed = 0;
  /** the hunter following the lure: seconds it has, how far behind it is, how long the lure has been too fast or too still for it, when it means to strike; seconds a bite has been held through */
  readonly follow = { t: 0, gap: 3, fast: 0, still: 0, at: 2.5, held: 0 };
  private jiggleT = 0;
  /** the fish's strength over the rod's power, once hooked */
  ratio = 0;
  /** what happened since the host last read */
  readonly events: SessionEvent[] = [];
  private down = false;
  private holdT = 0;
  private struck = false;
  private twitchT = 0;
  private twitchCd = 0;
  private tick = 0;
  private bitT = 0;
  private bellT = -1;
  private retrieveT = 0;
  private hookAngle = 0;
  private nobodySaid = false;
  private lastTell = false;
  private lastPhase: FishPhase = 'swim';
  private lastDir = 0;
  private lastBolt = false;
  private lastLandable = false;
  private readonly rng: Stream;

  constructor(
    readonly pond: Pond,
    private readonly host: SessionHost,
    seed: number,
  ) {
    this.rng = new Stream(seed);
  }

  /** the button: down or up */
  press(down: boolean): void {
    if (down === this.down) return;
    this.down = down;
    if (down) this.onDown();
    else this.onUp();
  }

  get held(): boolean {
    return this.down;
  }

  private onDown(): void {
    this.holdT = 0;
    this.struck = false;
    switch (this.phase) {
      case 'idle':
        this.phase = 'charge';
        this.charge = 0;
        break;
      case 'wait': {
        const c = this.committed;
        if (this.junk && this.bitT >= 0) {
          this.strike(null);
          this.struck = true;
        } else if (c && c.state === 'bite') {
          this.strike(c);
          this.struck = true;
        } else if (c && (c.state === 'nibble' || (c.state === 'come' && Math.hypot(c.x - this.float.x, c.z - this.float.z) < 2))) {
          // too soon: it feels the hook and is gone
          this.events.push({ type: 'early', uid: c.uid });
          c.state = 'flee';
          c.t = 0;
          c.shy = 15;
          this.committed = null;
          this.struck = true;
        }
        break;
      }
      case 'fight':
        // a fresh press with the fish spent at one's feet lands it
        if (this.fight?.landable) this.landFish();
        break;
      default:
        break;
    }
  }

  private onUp(): void {
    if (this.phase === 'charge') this.cast();
    else if (this.phase === 'wait' && !this.struck && this.holdT < 0.3 && (this.host.level?.() ?? 3) >= 3 && this.twitchCd <= 0) {
      this.twitchT = 3;
      this.twitchCd = 1;
      this.events.push({ type: 'twitch' });
    }
  }

  /** the bait's reach for a rod (m) at a charge */
  static reach(cast: number, charge: number): number {
    return 2.5 + (cast - 2.5) * Math.min(1, Math.max(0, charge));
  }

  private cast(): void {
    const rig = this.host.rig();
    const dist = Session.reach(rig.rod.cast, this.charge);
    const a = this.fan ? Math.max(-FAN, Math.min(FAN, this.aim)) : this.aim;
    const spread = 0.3 + 0.025 * dist;
    const ax = this.angler.x;
    const az = this.angler.z;
    const x = ax + Math.sin(a) * dist + (this.rng.next() - 0.5) * spread;
    const z = az + Math.cos(a) * dist + (this.rng.next() - 0.5) * spread;
    const f = this.float;
    f.fromX = ax + Math.sin(a) * 0.8;
    f.fromZ = az + Math.cos(a) * 0.6;
    f.toX = x;
    f.toZ = z;
    f.x = f.fromX;
    f.z = f.fromZ;
    f.t = 0;
    f.dur = 0.4 + 0.028 * dist;
    f.wet = false;
    f.dip = 0;
    this.phase = 'flight';
    this.events.push({ type: 'cast', x, z, dist });
  }

  private strike(c: PondFish | null, auto = false): void {
    const rig = this.host.rig();
    if (c) {
      const def = FISH[c.f];
      const w = c.window || strikeWindow(def, rig);
      this.perfect = !auto && c.t <= PERFECT_SHARE * w;
      c.state = 'hooked';
      this.hooked = c;
      this.committed = null;
      this.ratio = c.strength / rig.rod.power;
      this.fightP = fightParams({ ratio: this.ratio, pool: c.pool, temper: def.temper, move: def.move, slick: def.slick, tier: def.tier, feel: rig.rod.feel, cast: rig.rod.cast, speed: rig.rod.reel, line: rig.tackle.line, reel: rig.tackle.reel, damp: hasCharm(rig, 'damp') });
      this.fight = startFight(Math.max(2, Math.hypot(c.x - this.angler.x, c.z - this.angler.z)), c.uid * 2654435761);
      this.hookAngle = Math.atan2(c.x - this.angler.x, c.z - this.angler.z);
      this.events.push({ type: 'hook', uid: c.uid, tier: def.tier, ratio: this.ratio, perfect: this.perfect, junk: false });
      this.events.push({ type: 'consume' });
    } else {
      // junk: a dead weight, wound in (it lies "spent" from the first: nothing to walk)
      this.perfect = false;
      this.hooked = null;
      this.ratio = 0.12;
      this.fightP = { ...fightParams({ ratio: 0.12, pool: 1, temper: 'steady', tier: 0, feel: rig.rod.feel, cast: rig.rod.cast, speed: rig.rod.reel, line: rig.tackle.line, reel: rig.tackle.reel }), spentFor: 1e9, bolt: false };
      this.fight = startFight(Math.max(2, Math.hypot(this.float.x - this.angler.x, this.float.z - this.angler.z)), this.rng.int(1 << 30));
      this.fight.stamina = 0;
      this.fight.phase = 'spent';
      this.fight.phaseT = 1e9;
      this.hookAngle = Math.atan2(this.float.x - this.angler.x, this.float.z - this.angler.z);
      this.events.push({ type: 'hook', uid: -1, tier: -1, ratio: 0.12, perfect: false, junk: true });
    }
    this.lastTell = false;
    this.lastPhase = this.fight.phase;
    this.lastDir = this.fight.dir;
    this.lastBolt = false;
    this.lastLandable = false;
    this.steer = 0;
    this.phase = 'fight';
  }

  /** the fish spent at one's feet: up it comes (a fresh press does it; the host's own reasons too); whether it did */
  landFish(): boolean {
    const s = this.fight;
    if (this.phase !== 'fight' || !s || !landFight(s)) return false;
    this.endFight();
    return true;
  }

  /** end the reveal (the host has kept, released or used the fish) */
  done(): void {
    if (this.phase !== 'reveal') return;
    this.last = null;
    this.phase = 'idle';
  }

  /**
   * The rod left the hands (put down, another thing taken up: docs/V3/plan/fishing.md): whatever was under way is
   * over at once — a fish on the line gets away (shy for a minute), the bait is back, the float out of the water.
   */
  abort(): void {
    this.lureSpeed = 0;
    if (this.phase === 'fight') {
      const h = this.hooked;
      if (h) {
        this.pond.escape(h.uid, 60);
        this.events.push({ type: 'lost', why: 'thrown', uid: h.uid, fish: h.f });
      }
      this.fight = null;
      this.fightP = null;
      this.hooked = null;
    }
    if (this.committed && this.committed.state !== 'hooked') {
      this.committed.state = 'roam';
      this.committed = null;
    }
    this.junk = null;
    this.last = null;
    this.phase = 'idle';
    this.charge = 0;
    this.down = false;
    this.float.wet = false;
    this.float.dip = 0;
  }

  /** wind the bait in now (the host's own reasons: the bait was changed, a panel opened) */
  reelIn(): void {
    if (this.phase === 'wait' || this.phase === 'flight') this.toRetrieve();
  }

  /** is what is on the hook a lure (fished by winding it in), not a bait left still or a fish alive */
  isLure(rig: Rig = this.host.rig()): boolean {
    return rig.bait.kind === 'lure' && rig.bait.live === undefined && !rig.bait.star;
  }

  private toRetrieve(): void {
    this.lureSpeed = 0;
    if (this.committed && this.committed.state !== 'hooked') {
      this.committed.state = 'roam';
      this.committed = null;
    }
    this.junk = null;
    this.phase = 'retrieve';
    this.retrieveT = 0;
    this.events.push({ type: 'retrieve' });
  }

  step(dt: number, c: Conditions): void {
    const rig = this.host.rig();
    if (this.down) this.holdT += dt;
    this.twitchCd = Math.max(0, this.twitchCd - dt);
    this.twitchT = Math.max(0, this.twitchT - dt);
    const f = this.float;
    switch (this.phase) {
      case 'charge':
        this.charge = Math.min(1, this.charge + dt / 1.0);
        break;
      case 'flight': {
        f.t += dt;
        const u = Math.min(1, f.t / f.dur);
        f.x = f.fromX + (f.toX - f.fromX) * u;
        f.z = f.fromZ + (f.toZ - f.fromZ) * u;
        if (u >= 1) this.land(c);
        break;
      }
      case 'wait':
        this.waitStep(dt, rig, c);
        break;
      case 'fight':
        this.fightStep(dt);
        break;
      case 'retrieve':
        this.retrieveT += dt;
        f.x = this.angler.x + (f.x - this.angler.x) * Math.max(0, 1 - dt * 4);
        f.z = this.angler.z + (f.z - this.angler.z) * Math.max(0, 1 - dt * 4);
        f.dip = 0;
        if (this.retrieveT > 0.6) {
          f.wet = false;
          this.phase = 'idle';
        }
        break;
      default:
        break;
    }
  }

  private land(c: Conditions): void {
    const f = this.float;
    const wet = this.water(f.x, f.z);
    if (wet < 0.35) {
      // (on the bank, or in water too shallow for anything to swim in)
      this.events.push({ type: 'bank', shallow: wet > 0.02 });
      this.toRetrieve();
      return;
    }
    f.wet = true;
    // the splash: whatever is right under it is gone
    let spooked = 0;
    for (const fish of this.pond.fish) {
      if (fish.state === 'hooked') continue;
      if (Math.hypot(fish.x - f.x, fish.z - f.z) < 1.6) {
        fish.state = 'flee';
        fish.t = 0;
        fish.shy = Math.max(fish.shy, 15);
        spooked++;
      }
    }
    this.events.push({ type: 'splash', x: f.x, z: f.z, spooked });
    this.phase = 'wait';
    this.waitT = 0;
    this.tick = 0;
    this.bitT = -1;
    this.bellT = -1;
    this.committed = null;
    this.junk = null;
    this.nobodySaid = false;
    this.bringIn(this.host.rig(), c);
  }

  /** how far off a fish notices the bait (m): further the longer it waits, with the lamp, and for a lure on the move */
  private noticeR(rig: Rig): number {
    return 5.5 + (hasCharm(rig, 'lamp') ? 4 : 0) + Math.min(6, this.waitT * 0.15) + (this.isLure(rig) ? 3 : 0);
  }

  /**
   * A bait of a rarity cast where no fish of that rarity that would take it now is in reach: one is brought in near
   * the float (pond.ts bringIn), so a wait is never empty (docs/V3/plan/fishing-feel.md §10). A fish alive on the hook
   * (the lords' bait) and the star bait (the sky's fish, in their moment) bring nobody: those come by their own rules.
   */
  private bringIn(rig: Rig, c: Conditions): void {
    const b = rig.bait;
    if (b.live !== undefined || b.star || b.tier < 0 || b.tier > 3) return;
    const f = this.float;
    const R = this.noticeR(rig);
    for (const fish of this.pond.fish) {
      if (fish.state !== 'roam' || fish.shy > 0 || Math.hypot(fish.x - f.x, fish.z - f.z) > R) continue;
      if (appetite(FISH[fish.f], fish.q, rig, c) > 0) return;
    }
    this.pond.bringIn(b.tier, f.x, f.z, (def, q) => appetite(def, q, rig, c) > 0);
  }

  private waitStep(dt: number, rig: Rig, c: Conditions): void {
    const f = this.float;
    this.waitT += dt;
    f.dip *= Math.max(0, 1 - dt * 6);
    const lure = this.isLure(rig);
    // a long press winds the bait in (after a press that scared a fish off too: held on, it still means "wind in");
    // a lure is wound in by holding, which is how it is fished
    if (!lure && this.down && this.holdT >= 0.45) {
      this.toRetrieve();
      return;
    }
    if (lure) {
      if (this.lureStep(dt, rig)) return;
    } else this.stillStep(dt);
    // the bell strikes for one
    if (this.bellT >= 0) {
      this.bellT -= dt;
      if (this.bellT < 0) {
        this.bellT = -2;
        if (this.junk) this.strike(null, true);
        else if (this.committed?.state === 'bite') this.strike(this.committed, true);
        return;
      }
    }
    // a junk bite under way
    if (this.junk) {
      this.bitT += dt;
      f.dip = 1;
      if (this.bitT > 0.9) {
        this.junk = null;
        this.bitT = -1;
        f.dip = 0;
      }
      return;
    }
    const k = this.committed;
    if (k) {
      if (k.state === 'flee' || k.state === 'roam') {
        this.committed = null;
        return;
      }
      // (one that cannot find its way to the bait gives up)
      if (k.state === 'come' && k.t > 7) {
        k.state = 'roam';
        k.shy = 6;
        this.committed = null;
        return;
      }
      if (k.state === 'nibble') {
        k.nibT -= dt;
        if (k.nibT <= 0) {
          if (k.nibbles > 0) {
            k.nibbles--;
            k.nibT = 0.6 + 0.7 * this.rng.next();
            f.dip = 0.45;
            this.events.push({ type: 'nibble', uid: k.uid });
          } else {
            k.state = 'bite';
            k.t = 0;
            k.window = strikeWindow(FISH[k.f], rig);
            f.dip = 1;
            this.events.push({ type: 'bite', uid: k.uid, tier: FISH[k.f].tier });
            if (hasCharm(rig, 'bell')) this.bellT = 0.25;
          }
        }
      } else if (k.state === 'bite') {
        f.dip = 1;
        if (k.t > k.window) {
          this.events.push({ type: 'miss', uid: k.uid });
          k.state = 'flee';
          k.t = 0;
          k.shy = 10;
          this.committed = null;
          f.dip = 0;
        }
      }
      return;
    }
    // ---- who notices the bait: a tick at a time
    this.tick += dt;
    if (this.tick < TICK) return;
    this.tick -= TICK;
    // junk, now and then
    const junkRate = 0.004 * (hasCharm(rig, 'magnet') ? 3 : 1);
    if (this.rng.next() < junkRate * TICK) {
      this.junk = this.pickJunk();
      this.bitT = 0;
      this.events.push({ type: 'bite', uid: -1, tier: -1 });
      if (hasCharm(rig, 'bell')) this.bellT = 0.25;
      return;
    }
    // (a lure on the move is seen from further off)
    const R = this.noticeR(rig);
    let sum = 0;
    let anyone = false;
    const ws: number[] = [];
    const who: PondFish[] = [];
    for (const fish of this.pond.fish) {
      if (fish.state !== 'roam') continue;
      const def = FISH[fish.f];
      const a = appetite(def, fish.q, rig, c);
      if (a > 0) anyone = true;
      if (fish.shy > 0 || a <= 0) continue;
      const d = Math.hypot(fish.x - f.x, fish.z - f.z);
      if (d > R) continue;
      const w = a * (fish.hungry > 0 ? 3 : 1) * Math.pow(1 - d / R, 1.2);
      sum += w;
      ws.push(w);
      who.push(fish);
    }
    if (!anyone && this.waitT > 20 && !this.nobodySaid) {
      this.nobodySaid = true;
      this.events.push({ type: 'nobody' });
    }
    if (sum <= 0) return;
    // (a lure lying still draws no hunter: it has to move)
    if (lure && this.lureSpeed < 0.3) return;
    // (the longer the bait waits, the readier they are: never a dead wait)
    // (a lure on the move is what a hunter cannot leave alone)
    const rate = sum * 1.0 * (1 + 0.05 * this.waitT) * (this.twitchT > 0 ? 2.2 : 1) * (lure ? 3 : 1);
    if (this.rng.next() > 1 - Math.exp(-rate * TICK)) return;
    let u = this.rng.next() * sum;
    let pick = who[who.length - 1];
    for (let i = 0; i < who.length; i++) {
      if (u < ws[i]) {
        pick = who[i];
        break;
      }
      u -= ws[i];
    }
    pick.t = 0;
    const wary = FISH[pick.f].wary || FISH[pick.f].tier >= 3;
    this.committed = pick;
    if (lure) {
      // a hunter after the lure: it follows, closing in, and strikes when it has followed long enough
      pick.state = 'follow';
      const fl = this.follow;
      fl.t = 0;
      fl.gap = Math.max(1.5, Math.min(5, Math.hypot(pick.x - f.x, pick.z - f.z)));
      fl.fast = fl.still = fl.held = 0;
      fl.at = (1 + 1.6 * this.rng.next()) * (wary ? 1.5 : 1);
      this.events.push({ type: 'follow', uid: pick.uid });
      return;
    }
    pick.state = 'come';
    pick.nibbles = wary ? 1 + this.rng.int(3) : this.rng.int(3);
    this.events.push({ type: 'come', uid: pick.uid });
  }

  /**
   * A lure in the water (docs/V3/plan/fishing-fight.md §5): held, it is wound in — the faster the longer it is held —
   * let go, it stops; a hunter after it follows, closing in; too fast it is left behind, still too long it loses
   * interest, wound in evenly long enough (or stopped short after a while) it strikes. A strike held through a moment
   * sets the hook. True: the lure is in at one's feet (the cast is over).
   */
  private lureStep(dt: number, rig: Rig): boolean {
    const f = this.float;
    if (this.down) this.lureSpeed = Math.min(LURE_MAX, this.lureSpeed + dt * (this.lureSpeed < 0.9 ? 3.2 : 0.6));
    else this.lureSpeed = Math.max(0, this.lureSpeed - dt * 4);
    const k = this.committed;
    // (a hunter that has struck holds the lure)
    const struck = !!k && k.state === 'bite';
    if (this.lureSpeed > 0 && !struck) {
      const ax = this.angler.x - f.x;
      const az = this.angler.z - f.z;
      const d = Math.hypot(ax, az);
      if (d < 2.4) {
        this.toRetrieve();
        return true;
      }
      const step = Math.min(d, this.lureSpeed * dt);
      f.x += (ax / d) * step;
      f.z += (az / d) * step;
    }
    if (struck && this.down) {
      // held through the strike: the hook is set
      this.follow.held += dt;
      if (this.follow.held > 0.2) {
        this.strike(k!);
        return true;
      }
    }
    if (!k || k.state !== 'follow') return false;
    const fl = this.follow;
    fl.t += dt;
    // it follows behind the lure (on the far side of it from the angler), closing in, swaying
    fl.gap = Math.max(0.5, fl.gap - dt * 0.7);
    const ax = this.angler.x - f.x;
    const az = this.angler.z - f.z;
    const ad = Math.hypot(ax, az) || 1;
    const sway = Math.sin(fl.t * 3.1 + k.uid) * 0.25;
    const bx = f.x - (ax / ad) * fl.gap + (az / ad) * sway;
    const bz = f.z - (az / ad) * fl.gap - (ax / ad) * sway;
    k.x += (bx - k.x) * Math.min(1, dt * 3);
    k.z += (bz - k.z) * Math.min(1, dt * 3);
    k.heading = Math.atan2(ax, az);
    // the pace
    const wasStill = fl.still > 0;
    if (this.lureSpeed > LURE_FAST) fl.fast += dt;
    else fl.fast = Math.max(0, fl.fast - dt);
    if (this.lureSpeed < 0.2) fl.still += dt;
    else fl.still = 0;
    if (fl.fast > 0.8) return this.loseInterest(k, 'fast');
    if (fl.still > 1.6) return this.loseInterest(k, 'still');
    // (stopped short after a good follow: it may snap at it then and there; and at one's feet it takes it or turns away)
    const pause = !wasStill && fl.still > 0 && fl.t > 1.2 && this.rng.next() < 0.4;
    const last = ad < 4.2 && fl.t > 0.6;
    if ((fl.t > fl.at && this.lureSpeed >= 0.35) || pause || last) {
      k.state = 'bite';
      k.t = 0;
      k.window = strikeWindow(FISH[k.f], rig) * 1.2;
      fl.held = 0;
      f.dip = 1;
      this.events.push({ type: 'bite', uid: k.uid, tier: FISH[k.f].tier });
      if (hasCharm(rig, 'bell')) this.bellT = 0.25;
    }
    return false;
  }

  private loseInterest(k: PondFish, why: 'fast' | 'still'): boolean {
    k.state = 'roam';
    k.shy = why === 'fast' ? 5 : 4;
    k.t = 9;
    this.committed = null;
    this.events.push({ type: 'lostInterest', uid: k.uid, why });
    return false;
  }

  /** a still bait: the view turned hard while a fish is at it (coming, nibbling) scares it off */
  private stillStep(dt: number): void {
    const k = this.committed;
    if (k && (k.state === 'come' || k.state === 'nibble') && this.jiggle > JIGGLE) {
      this.jiggleT += dt;
      if (this.jiggleT > 0.12) {
        k.state = 'flee';
        k.t = 0;
        k.shy = 12;
        this.committed = null;
        this.jiggleT = 0;
        this.events.push({ type: 'spooked', uid: k.uid });
      }
    } else this.jiggleT = Math.max(0, this.jiggleT - dt);
  }

  private pickJunk(): Junk {
    let u = this.rng.next();
    for (const [j, w] of JUNKS) {
      if (u < w) return j;
      u -= w;
    }
    return 'boot';
  }

  private fightStep(dt: number): void {
    const s = this.fight;
    const p = this.fightP;
    if (!s || !p) return;
    stepFight(s, p, { reel: this.down, steer: this.steer }, dt);
    if (s.tell > 0 && !this.lastTell) this.events.push({ type: 'tell', next: s.next });
    this.lastTell = s.tell > 0;
    if (s.phase !== this.lastPhase) {
      this.lastPhase = s.phase;
      this.events.push({ type: 'phase', phase: s.phase });
    }
    if (s.dir !== this.lastDir) {
      this.lastDir = s.dir;
      if (this.hooked) this.events.push({ type: 'turn', dir: s.dir });
    }
    if (s.bolted && !this.lastBolt) this.events.push({ type: 'bolt' });
    this.lastBolt = s.bolted;
    if (s.landable && !this.lastLandable) this.events.push({ type: 'landable' });
    this.lastLandable = s.landable;
    this.placeFish();
    if (s.end !== 'none') this.endFight();
  }

  /** where the fish is: along the line, swung across with its runs (the float on it) */
  private placeFish(): void {
    const s = this.fight!;
    const a = this.hookAngle + s.side * 0.5;
    const fx = this.angler.x + Math.sin(a) * s.dist;
    const fz = this.angler.z + Math.cos(a) * s.dist;
    const h = this.hooked;
    if (h) {
      // (it swims where there is water: brought to the bank, it stays at its edge)
      if (this.depthAt ? this.water(fx, fz) >= (s.dist < 3 ? 0.12 : 0.3) : this.pond.shape.swims(fx, fz, s.dist < 3 ? 0.12 : 0.3) || s.dist < 3) {
        h.x = fx;
        h.z = fz;
      }
      // (it pulls away from the angler and off across the line, the way it swims; spent, it comes in on its side)
      h.heading = s.phase === 'spent' ? a + Math.PI + s.dir * 0.3 : a + s.dir * 1.1;
      this.float.x = h.x;
      this.float.z = h.z;
    } else {
      this.float.x = fx;
      this.float.z = fz;
    }
  }

  /** the fight is over: landed (the catch held up) or lost */
  private endFight(): void {
    const s = this.fight!;
    const h = this.hooked;
    const rig = this.host.rig();
    if (s.end === 'landed') {
      const landed: Landed = h
        ? { uid: h.uid, fish: h.f, cm: h.cm, kg: h.kg, q: h.q, perfect: this.perfect, secs: s.t }
        : { uid: -1, fish: -1, cm: 0, kg: 0, q: 0, perfect: false, junk: this.junk ?? this.pickJunk(), secs: s.t };
      if (h) {
        this.pond.land(h.uid);
        // the twin hook brings a small one up too, now and then
        if (hasCharm(rig, 'double') && this.rng.next() < 0.12) {
          const small = fishOfTier(0);
          const bf = small[this.rng.int(small.length)];
          const size = rollLength(FISH[bf], this.rng.next(), this.rng.next());
          landed.bonus = { fish: bf, cm: size.cm, kg: size.kg, q: size.q };
        }
      }
      this.last = landed;
      this.events.push({ type: 'landed', landed });
      this.phase = 'reveal';
    } else {
      if (h) {
        // it is still in the water, shy for a while (a lord for longer)
        this.pond.escape(h.uid, FISH[h.f].tier >= 4 ? 300 : 90);
        this.events.push({ type: 'lost', why: s.end, uid: h.uid, fish: h.f });
      } else this.events.push({ type: 'lost', why: s.end, uid: -1, fish: -1 });
      this.phase = 'retrieve';
      this.retrieveT = 0;
    }
    this.fight = null;
    this.fightP = null;
    this.hooked = null;
    this.junk = null;
    this.float.wet = this.phase === 'retrieve';
  }
}
