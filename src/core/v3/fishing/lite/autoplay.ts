/**
 * An angler that plays by itself (docs/V3/nodes/F2-fishing-lite.md §2, §10): it picks a fish it can see that would
 * take its bait, casts a little in front of it, strikes after its reaction time, plays the fight with a robot's
 * hands (robot.ts) and keeps what it catches; with `shops` it also sells, buys bait, rods, licences and tackle and
 * moves on to the next water as a player would. The tests and the balance simulation run it in Node; the page's
 * developer panel can let it fish.
 */
import { BAITS, BAIT_INDEX, REC_ROD, RODS, STAR_TIER, TACKLE_MAX, tacklePrice } from './gear';
import { FISH } from './fish';
import { robotHands, robotPlay, USUAL, type RobotHands, type RobotSkill } from './robot';
import { appetite, Stream } from './rules';
import type { Angler } from './progress';
import { isNight, spotBase } from './progress';
import type { PondFish } from './pond';
import { Session } from './session';
import { SPOTS } from './spots';
import { TACKLE_LINES, type Catch, type Conditions } from './types';

export interface AutoStats {
  casts: number;
  catches: number;
  lost: number;
  junk: number;
  byTier: number[];
  fightSecs: number;
}

export class AutoAngler {
  robot: RobotSkill;
  /** also sell, buy and move on */
  shops = false;
  /** only the thumb: the host reads the session's events and ends the reveal itself (the page) */
  handsOnly = false;
  readonly stats: AutoStats = { casts: 0, catches: 0, lost: 0, junk: 0, byTier: [0, 0, 0, 0, 0, 0], fightSecs: 0 };
  /** the last catch's card (for the page) */
  lastCatch: Catch | null = null;
  private hands: RobotHands;
  /** the fight the hands are on (a new one: fresh hands) */
  private handsOn: object | null = null;
  private want = 0;
  private biteSeen = -1;
  private pressT = -1;
  private revealT = 0;
  private readonly rng: Stream;

  constructor(
    readonly session: Session,
    readonly angler: Angler,
    seed: number,
    robot: RobotSkill = USUAL,
  ) {
    this.robot = robot;
    this.hands = robotHands(seed);
    this.rng = new Stream(seed ^ 0xa070);
  }

  /** a fish to cast at: one that would take the bait, within reach, the nearest-looking first */
  private target(c: Conditions): PondFish | null {
    const rig = this.angler.rig();
    const reach = Session.reach(rig.rod.cast, 1);
    let best: PondFish | null = null;
    let bestW = 0;
    for (const f of this.session.pond.fish) {
      if (f.state !== 'roam' || f.shy > 0) continue;
      const d = Math.hypot(f.x, f.z);
      if (d > reach + 2) continue;
      const a = appetite(FISH[f.f], f.q, rig, c);
      if (a <= 0) continue;
      // (it prefers the rarer, and those it can see)
      const w = a * (1 + FISH[f.f].tier * 0.6) * (f.zone === 0 ? 1.3 : 1) * (0.6 + 0.4 * this.rng.next());
      if (w > bestW) {
        bestW = w;
        best = f;
      }
    }
    return best;
  }

  /** one step of dt seconds; returns the catch's card when one is held up this step */
  step(dt: number, c: Conditions, worldT: number): Catch | null {
    const s = this.session;
    let out: Catch | null = null;
    switch (s.phase) {
      case 'idle': {
        if (!this.angler.hasBait()) {
          if (this.shops) this.shop(c);
          if (!this.angler.hasBait()) return null;
        }
        const f = this.target(c);
        const rig = this.angler.rig();
        if (f) {
          // a cast landing a metre or two in front of it
          const d = Math.hypot(f.x, f.z);
          const ahead = Math.max(2.6, d - 2.4);
          s.aim = Math.atan2(f.x, f.z);
          this.want = Math.min(1, (ahead - 2.5) / Math.max(0.1, rig.rod.cast - 2.5));
        } else {
          s.aim = (this.rng.next() * 2 - 1) * 0.9;
          this.want = 0.3 + 0.7 * this.rng.next();
        }
        s.press(true);
        this.stats.casts++;
        if (!this.handsOnly) this.angler.s.stats.casts++;
        break;
      }
      case 'charge':
        if (s.charge >= this.want) s.press(false);
        break;
      case 'wait': {
        const k = s.committed;
        const biting = (k && k.state === 'bite') || (s.junk && true);
        // a lure: wound in at an even pace (held a while, let go a moment), held through a strike
        if (s.isLure()) {
          s.press(!!biting || s.waitT % 1.25 < 0.85);
          break;
        }
        if (biting) {
          if (this.biteSeen < 0) this.biteSeen = 0;
          this.biteSeen += dt;
          if (this.biteSeen >= this.robot.strike && this.pressT < 0) {
            s.press(true);
            this.pressT = 0;
          }
        } else this.biteSeen = -1;
        if (this.pressT >= 0) {
          this.pressT += dt;
          if (this.pressT > 0.08) {
            s.press(false);
            this.pressT = -1;
          }
        }
        // nothing coming for a long while: wind in and try elsewhere
        if (((!k && !s.junk && s.waitT > 15) || s.waitT > 30) && this.pressT < 0) s.press(true);
        break;
      }
      case 'retrieve':
        s.press(false);
        this.pressT = -1;
        this.biteSeen = -1;
        break;
      case 'fight':
        this.biteSeen = -1;
        if (s.fight && s.fightP) {
          if (this.handsOn !== s.fight) {
            this.handsOn = s.fight;
            this.hands = robotHands(this.rng.int(1 << 30));
          }
          const h = robotPlay(this.hands, this.robot, s.fight, s.fightP, dt);
          s.steer = h.steer;
          if (!(h.land && s.landFish())) s.press(h.reel);
        }
        break;
      case 'reveal':
        s.press(false);
        if (this.handsOnly) break;
        this.revealT += dt;
        if (this.revealT > 2.5) {
          this.revealT = 0;
          const l = s.last;
          if (l) {
            if (l.fish < 0) {
              this.stats.junk++;
              this.angler.junk(l.junk ?? 'boot', this.rng.next());
            } else {
              const card = this.angler.finish(l, isNight(c.hour), c.day, this.rng.next());
              this.stats.catches++;
              this.stats.byTier[FISH[l.fish].tier]++;
              this.stats.fightSecs += l.secs;
              this.lastCatch = card;
              out = card;
              if (!this.angler.keep(card, l.uid, l.q)) {
                if (this.shops) {
                  this.angler.sellAll();
                  this.angler.keep(card, l.uid, l.q);
                } else this.angler.release(card);
              }
              this.angler.claim();
              this.angler.unlocks();
            }
          }
          s.done();
          if (this.shops) this.shop(c);
        }
        break;
      default:
        break;
    }
    // what the session says (the host's to read when it reads them itself)
    if (this.handsOnly) return out;
    for (const e of s.events) {
      if (e.type === 'consume') this.angler.consume(this.rng.next());
      if (e.type === 'lost') {
        this.stats.lost++;
        this.angler.s.stats.lost++;
        if (e.why === 'snap') this.angler.loseLure();
      }
    }
    s.events.length = 0;
    void worldT;
    return out;
  }

  /** put on the bait held that the fish in the water want most now (weighted toward the rarer) */
  chooseBait(c: Conditions): void {
    const a = this.angler;
    const s = a.s;
    const was = s.bait;
    let best = was;
    let bestW = -1;
    for (const b of BAITS) {
      if (!(s.baits[b.id] > 0) || b.tier === STAR_TIER) continue;
      s.bait = b.id;
      const rig = a.rig();
      let w = 0;
      for (const f of this.session.pond.fish) w += appetite(FISH[f.f], f.q, rig, c) * (1 + FISH[f.f].tier);
      if (w > bestW) {
        bestW = w;
        best = b.id;
      }
    }
    s.bait = best;
  }

  /** a player's shopping: keep bait, buy this water's rod, the tackle, the next licence, and go */
  shop(c: Conditions): void {
    const a = this.angler;
    const s = a.s;
    a.sellAll();
    const spot = s.spot;
    const base = spotBase(spot);
    // the water's rod first
    for (const id of a.rodsHere()) if (!s.rods.includes(id)) a.buyRod(id);
    // (a bait draws its own rarity only, one bait to each: the baits of every rarity it holds the rod for, a pack each
    // when cheap against a catch here; a lure, one, kept till the line parts)
    const here = a.baitsHere().map((id) => BAITS[BAIT_INDEX.get(id) ?? 0]);
    const held = (t: number): boolean => s.rods.includes(RODS[REC_ROD[t]].id);
    for (const b of here) {
      if (b.tier > 0 && !held(b.tier)) continue;
      if (b.lure) {
        if (!(s.baits[b.id] > 0) && s.coins > b.price * 4) a.buyBait(b.id);
        continue;
      }
      if (b.price > base * 1.5) continue;
      while ((s.baits[b.id] ?? 0) < 20 && s.coins > b.price * b.pack * 2) if (!a.buyBait(b.id)) break;
    }
    // the bait on the hook: the one held that the fish in the water want most now
    this.chooseBait(c);
    // the tackle, when it is cheap against the purse
    for (const line of TACKLE_LINES) {
      const lv = s.tackle[line];
      if (lv < TACKLE_MAX && tacklePrice(line, lv) < s.coins * 0.25) a.upgrade(line);
    }
    // the next water, once every rod sold up to here is held and the licence affordable
    const next = spot + 1;
    if (next < SPOTS.length && RODS.every((r) => r.shop < 0 || r.shop > spot || s.rods.includes(r.id))) {
      if (!s.licences.includes(next)) a.buyLicence(next);
      if (s.licences.includes(next) && a.speciesOf(spot) >= 6) {
        a.travel(next);
      }
    }
    void c;
  }
}
