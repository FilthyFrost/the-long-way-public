/**
 * A bobblehead's nod (docs/ND/PLAN.md, ND4; Nomad Drive's toy wobble with its asset's values): its head on a spring
 * that follows what the thing it stands on does — the velocity it moves with smoothed (0.07 s), and the difference
 * between a quick (0.03 s) and a slow (0.12 s) follow of that is how hard it is pushed, in its own frame: forward
 * and back nods it (11° at 0.35 m/s of it), a bump up nods it too (9°), a push sideways leans it (11°). Moving, a slow
 * drift sways it besides (4° of nod, 12° of lean, 0.9 a second, full at 5 m/s, three quarters less while it leans);
 * in the hands 0.803 of all that; never past 28°. The spring is 2.4 a second with 0.28 of its damping, stepped at
 * 1/120 s (four steps a frame at most); at its limit it stops. Set back after a jump of more than 5 m; at rest when it
 * is all but still. Pure: no three, no DOM.
 */

export const WOBBLE = {
  maxDeg: 28,
  hz: 2.4,
  damping: 0.28,
  swayNod: 4,
  swayRoll: 12,
  swayHz: 0.9,
  swayDuck: 0.75,
  swayFull: 5,
  lean: 11,
  bump: 9,
  /** the push (m/s of the follows' difference) that leans it all the way */
  push: 0.35,
  held: 0.803,
  smoothS: 0.07,
  fastS: 0.03,
  slowS: 0.12,
  resetM: 5,
  restDeg: 0.05,
  restV: 0.02,
  /** further than this from the eye it is left at rest (m) */
  farM: 40,
  stepS: 1 / 120,
  maxSteps: 4,
} as const;

const K = (2 * Math.PI * WOBBLE.hz) ** 2;
const C = 2 * WOBBLE.damping * 2 * Math.PI * WOBBLE.hz;
const clamp1 = (x: number): number => (x < -1 ? -1 : x > 1 ? 1 : x);

/** a frame the thing stands in: its forward, up and right as unit vectors (world) */
export interface Axes {
  fx: number;
  fy: number;
  fz: number;
  ux: number;
  uy: number;
  uz: number;
  rx: number;
  ry: number;
  rz: number;
}

/** a slow drift between −1 and 1 (two sines out of step, Nomad Drive's noise in spirit) */
function drift(t: number, phase: number): number {
  const w = 2 * Math.PI * WOBBLE.swayHz;
  return 0.62 * Math.sin(w * t + phase) + 0.38 * Math.sin(w * 1.73 * t + phase * 2.1 + 1.3);
}

export class Wobble {
  /** the head's nod (+ forward, its face down) and lean (+ to its left), degrees, and how fast they change */
  nod = 0;
  roll = 0;
  vn = 0;
  vr = 0;
  private sv = [0, 0, 0];
  private fast = [0, 0, 0];
  private slow = [0, 0, 0];
  private last: [number, number, number] | null = null;
  private t = 0;
  constructor(private readonly phase = 0) {}

  /** set back (a jump: a thing put somewhere else) */
  reset(): void {
    this.nod = this.roll = this.vn = this.vr = 0;
    this.sv = [0, 0, 0];
    this.fast = [0, 0, 0];
    this.slow = [0, 0, 0];
    this.last = null;
  }

  /** at rest: still, and nothing moving it */
  get resting(): boolean {
    return Math.abs(this.nod) < WOBBLE.restDeg && Math.abs(this.roll) < WOBBLE.restDeg && Math.abs(this.vn) < WOBBLE.restV * 50 && Math.abs(this.vr) < WOBBLE.restV * 50 && Math.hypot(this.sv[0], this.sv[1], this.sv[2]) < WOBBLE.restV;
  }

  /** dt seconds on: where its base is now (world m), its frame, whether it is in the hands */
  step(dt: number, x: number, y: number, z: number, a: Axes, held = false): void {
    if (dt <= 0) return;
    this.t += dt;
    const l = this.last;
    if (l && Math.hypot(x - l[0], y - l[1], z - l[2]) > WOBBLE.resetM) this.reset();
    const v = this.last ? [(x - this.last[0]) / dt, (y - this.last[1]) / dt, (z - this.last[2]) / dt] : [0, 0, 0];
    this.last = [x, y, z];
    const ks = 1 - Math.exp(-dt / WOBBLE.smoothS);
    const kf = 1 - Math.exp(-dt / WOBBLE.fastS);
    const kl = 1 - Math.exp(-dt / WOBBLE.slowS);
    for (let i = 0; i < 3; i++) {
      this.sv[i] += (v[i] - this.sv[i]) * ks;
      this.fast[i] += (this.sv[i] - this.fast[i]) * kf;
      this.slow[i] += (this.sv[i] - this.slow[i]) * kl;
    }
    const d0 = this.fast[0] - this.slow[0];
    const d1 = this.fast[1] - this.slow[1];
    const d2 = this.fast[2] - this.slow[2];
    const af = d0 * a.fx + d1 * a.fy + d2 * a.fz;
    const au = d0 * a.ux + d1 * a.uy + d2 * a.uz;
    const ar = d0 * a.rx + d1 * a.ry + d2 * a.rz;
    // pushed: forward nods it back, up nods it too, sideways leans it the other way
    let nod = -clamp1(af / WOBBLE.push) * WOBBLE.lean - clamp1(au / WOBBLE.push) * WOBBLE.bump;
    let roll = clamp1(ar / WOBBLE.push) * WOBBLE.lean;
    // moving: the drift on top, less while it leans
    const speed = Math.hypot(this.sv[0], this.sv[1], this.sv[2]);
    const s = Math.min(1, speed / WOBBLE.swayFull);
    if (s > 0) {
      const leaning = Math.min(1, (Math.abs(nod) + Math.abs(roll)) / WOBBLE.lean);
      const k = s * (1 - WOBBLE.swayDuck * leaning);
      nod += WOBBLE.swayNod * k * drift(this.t, this.phase);
      roll += WOBBLE.swayRoll * k * drift(this.t, this.phase + 2.4);
    }
    if (held) {
      nod *= WOBBLE.held;
      roll *= WOBBLE.held;
    }
    nod = Math.max(-WOBBLE.maxDeg, Math.min(WOBBLE.maxDeg, nod));
    roll = Math.max(-WOBBLE.maxDeg, Math.min(WOBBLE.maxDeg, roll));
    // the spring
    const n = Math.min(WOBBLE.maxSteps, Math.max(1, Math.round(dt / WOBBLE.stepS)));
    const h = Math.min(dt, WOBBLE.maxSteps * WOBBLE.stepS) / n;
    for (let i = 0; i < n; i++) {
      this.vn += (K * (nod - this.nod) - C * this.vn) * h;
      this.vr += (K * (roll - this.roll) - C * this.vr) * h;
      this.nod += this.vn * h;
      this.roll += this.vr * h;
      if (Math.abs(this.nod) > WOBBLE.maxDeg) {
        this.nod = Math.sign(this.nod) * WOBBLE.maxDeg;
        if (this.vn * this.nod > 0) this.vn = 0;
      }
      if (Math.abs(this.roll) > WOBBLE.maxDeg) {
        this.roll = Math.sign(this.roll) * WOBBLE.maxDeg;
        if (this.vr * this.roll > 0) this.vr = 0;
      }
    }
  }
}

/** the bobbleheads' kinds, in the order a world shuffles them into its deck */
export const BOBBLES = ['nd_bobble_1', 'nd_bobble_2', 'nd_bobble_3', 'nd_bobble_4'] as const;

/** a world's deck of bobbleheads: each buried chest opened deals the next, four in all (Nomad Drive's loot deck) */
export function bobbleDeck(worldSeed: number): string[] {
  const ids: string[] = [...BOBBLES];
  let s = (worldSeed ^ 0xb0bb1e) >>> 0 || 1;
  for (let i = ids.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
