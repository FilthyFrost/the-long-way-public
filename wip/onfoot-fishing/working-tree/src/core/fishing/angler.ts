/**
 * Robot anglers for the tests and the measurements: a competent one (casts at a shadow, waits for
 * the real bite, strikes at once, pulls against every run and reels only while the fish rests) and
 * a careless one (strikes at nibbles or late, keeps reeling, pulls any old way). They drive the
 * same Angling a player does, through the same input.
 */
import { Angling, type FishInput, type RodTip } from './angling';
import { Stream } from './school';

export type AnglerKind = 'competent' | 'careless';

export class Angler {
  readonly input: FishInput = { down: false, pullX: 0, pullY: 0, cancel: false };
  private readonly rng: Stream;
  private charge = 0;
  private react = 0;
  private lastNibbles = 0;
  private prev = false;

  constructor(
    readonly kind: AnglerKind,
    seed: number,
  ) {
    this.rng = new Stream(seed ^ 0x7a11);
  }

  /** choose the input for this step; may turn the rod tip's heading to face a shadow before casting */
  decide(a: Angling, tip: RodTip): FishInput {
    const inp = this.input;
    const careless = this.kind === 'careless';
    inp.cancel = false;
    inp.pullX = 0;
    inp.pullY = 0;
    switch (a.phase) {
      case 'idle': {
        // a shadow within reach: face it and charge for its distance
        // the nearest in reach, rather one ahead than one behind
        let best = null as null | { x: number; z: number; d: number };
        let bk = Infinity;
        for (const s of a.school.shadows) {
          if (s.state !== 'roam') continue;
          const d = Math.hypot(s.x - tip.x, s.z - tip.z);
          if (d < 4.5 || d > 13.5) continue;
          const off = Math.abs(Math.atan2(Math.sin(Math.atan2(s.z - tip.z, s.x - tip.x) - tip.heading), Math.cos(Math.atan2(s.z - tip.z, s.x - tip.x) - tip.heading)));
          const key = d + (off > 1.2 ? 20 : 0);
          if (key < bk) {
            bk = key;
            best = { x: s.x, z: s.z, d };
          }
        }
        if (!best) {
          inp.down = false;
          break;
        }
        tip.heading = Math.atan2(best.z - tip.z, best.x - tip.x);
        // just short of it: right on top of it, the splash would scare it off
        this.charge = Angling.chargeFor(best.d - 0.9 + (careless ? this.rng.range(-2.5, 2.5) : 0));
        // (a fresh press: let go first if the button was still held from the fight)
        inp.down = !this.prev;
        break;
      }
      case 'charging':
        inp.down = a.t < this.charge;
        break;
      case 'waiting':
        inp.down = false;
        if (careless && a.target) {
          // strikes at a nibble half the time
          const n = a.nibbles.length;
          if (n < this.lastNibbles && this.rng.next() < 0.5) inp.down = true;
          this.lastNibbles = n;
        } else this.lastNibbles = 4;
        // nothing came for a long while: wind in and cast again
        if (!a.target && a.t > 12) inp.down = true;
        this.react = careless ? this.rng.range(0.4, 1.4) : this.rng.range(0.18, 0.32);
        break;
      case 'bite':
        inp.down = a.t >= this.react;
        break;
      case 'fight': {
        if (careless) {
          inp.down = true;
          inp.pullX = this.rng.range(-1, 1);
          inp.pullY = this.rng.range(-1, 1);
          break;
        }
        const run = a.run;
        inp.pullX = run === 'left' ? 1 : run === 'right' ? -1 : 0;
        inp.pullY = run === 'out' ? 1 : 0;
        inp.down = run === 'none' && a.tension < 0.8;
        break;
      }
      case 'landed':
        inp.down = false;
        break;
      default:
        inp.down = false;
    }
    this.prev = inp.down;
    return inp;
  }
}
