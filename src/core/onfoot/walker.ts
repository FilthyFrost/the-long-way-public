/**
 * Walking in the world (docs/DESIGN_V2.md 6.2): a walker is an upright capsule — a circle of
 * radius `radius` on the plan between its feet and the top of its head — on the land's shape,
 * kept out of every solid nearby.
 *
 *   walk 1.9 m/s · run 3.6 · crouch 1.0 · carrying a big thing alone 1.2 · swimming 1.1
 *   eye 1.62 m (crouched 1.05) · jump 0.55 m · steps up to 0.3 m are walked up
 *   slopes up to 38° are walked, steeper ground slides one down and cannot be climbed
 *   wading slows one down; deeper than 1.1 m one swims (and floats: nobody drowns)
 *
 * Fixed steps of 1/120 s; every move is cut into pieces no longer than a third of the radius, so
 * nothing is tunnelled through at any speed. The head is smooth (5.3): steps and snaps are eased
 * out of the eye, the walking bob is a slow sine ≤ 2 cm, nothing above a few hertz.
 *
 * Plan directions are the road's (solids.ts): heading h faces (cos h, sin h) in (x, z), right is
 * (−sin h, cos h). Turning right increases h.
 */
import { Push, pushOut, type Solid, type SolidSource } from '../world/solids';
import { TerrainPoint, type Land } from './land';

export const FOOT = {
  walk: 1.9,
  run: 3.6,
  crouch: 1.0,
  /** a big thing carried alone (two people: 1.7) */
  carry: 1.2,
  carryTwo: 1.7,
  swim: 1.1,
  eye: 1.62,
  eyeCrouch: 1.05,
  /** swimming: the eye above the (floating) feet; they hang `swimDepth` under the surface */
  eyeSwim: 1.3,
  height: 1.8,
  heightCrouch: 1.25,
  radius: 0.3,
  /** jump height (m) */
  jump: 0.55,
  step: 0.3,
  slopeDeg: 38,
  /** water deeper than this is swum */
  swimDepth: 1.1,
  /** wading starts to slow one down from this depth */
  wadeFrom: 0.3,
  /** speed kept at the deepest wading */
  wadeKeep: 0.55,
  gravity: 9.81,
  h: 1 / 120,
  /** walking bob amplitude at walking pace (m); grows a little when running, never above 2 cm */
  bob: 0.012,
  bobMax: 0.018,
  /** steps per second: 2.4 walking, 2.9 running (one bob per step) */
  cadence: 1.75,
  cadencePerMs: 0.32,
} as const;

const TAN_SLOPE = Math.tan((FOOT.slopeDeg * Math.PI) / 180);
// (the fixed step loses a little height to the integration: v0 is solved for the stepped peak)
const JUMP_V = (FOOT.gravity * FOOT.h) / 2 + Math.sqrt(((FOOT.gravity * FOOT.h) / 2) ** 2 + 2 * FOOT.gravity * FOOT.jump);
/** a drop this big or less is followed down the next step without leaving the ground */
const SNAP_DOWN = 0.4;
/** how far a floor's edge can be stood on past the middle of the feet */
const FOOT_HOLD = 0.12;

export interface FootInput {
  /** stick: forward and right, −1…1 (the pair is limited to length 1) */
  forward: number;
  right: number;
  run: boolean;
  crouch: boolean;
  /** asks for a jump on the next step it can (cleared by the walker) */
  jump: boolean;
}

export type CarryLoad = 'none' | 'medium' | 'large';

export interface FootState {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  swimming: boolean;
  crouched: boolean;
}

/** an empty solid source */
export const NO_SOLIDS: SolidSource = { solidsNear: () => {} };

export class FootWalker {
  /** feet on the plan and their height (world m) */
  x = 0;
  y = 0;
  z = 0;
  heading = 0;
  /** look up (+) / down (−), rad: only the view and the pick use it */
  pitch = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = true;
  swimming = false;
  crouched = false;
  /** water depth over the ground here (0 = dry) */
  depth = 0;
  /** what the hands are full of: a big thing slows one to `carry` and forbids running and jumping */
  load: CarryLoad = 'none';
  /** the walking bob (the comfort setting can switch it off) */
  bobOn = true;
  /** ground slope under the feet (rad) and whether it is too steep to stand */
  slope = 0;
  sliding = false;
  /** the support under the feet comes from a solid's top (a step, a porch) */
  onFloor = false;

  // the eye: smoothed parts
  private eyeH: number = FOOT.eye;
  private stepOff = 0;
  private bobPhase = 0;
  private bobAmp = 0;
  private acc = 0;
  /** distance walked (m), for the measurements */
  walked = 0;

  private readonly tp = new TerrainPoint();
  private readonly push = new Push();
  private readonly near: Solid[] = [];

  constructor(
    public land: Land,
    public solids: SolidSource = NO_SOLIDS,
  ) {}

  // ---------------------------------------------------------------- queries

  /** height of the land (or a bridge deck, or the bed under it) at a point, for feet at `feet` */
  landAt(x: number, z: number, feet: number): number {
    const t = this.tp;
    this.land.shape(x, z, t);
    // under a bridge: the river's bed is the ground, the deck is overhead
    if (t.bridge > 0 && feet < t.h - 1.0 && t.bed < t.h) {
      this.wl = t.wl;
      return t.bed;
    }
    this.wl = t.wl;
    return t.h;
  }
  /** water level found by the last landAt */
  private wl = -Infinity;

  /** what the feet rest on at (x, z): the land or the top of a floor within a step (solids must be gathered) */
  private supportAt(x: number, z: number, feet: number): number {
    let s = this.landAt(x, z, feet);
    this.onFloor = false;
    for (const so of this.near) {
      if (!so.floor || so.y1 > feet + FOOT.step + 1e-6 || so.y1 <= s) continue;
      if (pushOut(so, x, z, FOOT_HOLD, this.push)) {
        s = so.y1;
        this.onFloor = true;
      }
    }
    return s;
  }

  get height(): number {
    return this.crouched ? FOOT.heightCrouch : FOOT.height;
  }

  /** the speed asked for right now (m/s) */
  topSpeed(run: boolean): number {
    if (this.swimming) return FOOT.swim;
    let v: number = this.load === 'large' ? FOOT.carry : this.crouched ? FOOT.crouch : run ? FOOT.run : FOOT.walk;
    if (this.depth > FOOT.wadeFrom) {
      const k = Math.min(1, (this.depth - FOOT.wadeFrom) / (FOOT.swimDepth - FOOT.wadeFrom));
      v *= 1 - (1 - FOOT.wadeKeep) * k;
    }
    return v;
  }

  /** is a solid in the way of a body standing with its feet at `feet`? */
  blocks(s: Solid, feet: number, height = this.height): boolean {
    if (s.y1 <= feet + 0.02) return false; // under the feet
    if (s.floor && s.y1 <= feet + FOOT.step + 1e-6) return false; // a step: walked up
    return s.y0 < feet + height;
  }

  /** would a body stand free at (x, z) with its feet on the ground there? */
  freeAt(x: number, z: number, margin = 0): boolean {
    this.gather(x, z, FOOT.radius + margin + 0.5);
    const feet = this.supportAt(x, z, Infinity);
    for (const s of this.near) if (this.blocks(s, feet, FOOT.height) && pushOut(s, x, z, FOOT.radius + margin, this.push)) return false;
    return true;
  }

  private gather(x: number, z: number, r: number): void {
    this.near.length = 0;
    this.solids.solidsNear(x, z, r, this.near);
  }

  // ---------------------------------------------------------------- placing

  /**
   * Stand at (x, z) facing `heading`, or at the free spot nearest to it (a spiral search out to
   * `search` m). Returns false when nothing free was found (the walker then stands at (x, z)).
   */
  place(x: number, z: number, heading = this.heading, search = 6): boolean {
    let px = x;
    let pz = z;
    let ok = this.freeAt(x, z);
    for (let r = 0.25; !ok && r <= search + 1e-9; r += 0.25) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 0.25));
      for (let i = 0; i < n && !ok; i++) {
        const a = (i / n) * 2 * Math.PI;
        const cx = x + Math.cos(a) * r;
        const cz = z + Math.sin(a) * r;
        if (this.freeAt(cx, cz)) {
          px = cx;
          pz = cz;
          ok = true;
        }
      }
    }
    this.x = px;
    this.z = pz;
    this.heading = heading;
    this.vx = this.vy = this.vz = 0;
    this.gather(px, pz, 1);
    this.y = this.supportAt(px, pz, Infinity);
    this.grounded = true;
    this.updateWater();
    if (this.swimming) this.y = Math.max(this.y, this.wl - FOOT.swimDepth);
    this.eyeH = this.targetEyeH();
    this.stepOff = 0;
    this.acc = 0;
    return ok;
  }

  // ---------------------------------------------------------------- stepping

  /** advance by dt seconds of real time in fixed steps (the remainder is kept for the next call) */
  advance(dt: number, input: FootInput): void {
    this.acc += Math.min(dt, 0.25);
    while (this.acc >= FOOT.h) {
      this.step(input);
      this.acc -= FOOT.h;
    }
  }

  /** one fixed step */
  step(input: FootInput): void {
    const h = FOOT.h;
    // crouching: standing back up needs the room to
    if (input.crouch !== this.crouched) {
      if (input.crouch || this.headroomFor(FOOT.height)) this.crouched = input.crouch && !this.swimming;
    }
    // ---- what the legs ask for
    let f = input.forward;
    let r = input.right;
    const len = Math.hypot(f, r);
    if (len > 1) {
      f /= len;
      r /= len;
    }
    const c = Math.cos(this.heading);
    const s = Math.sin(this.heading);
    const top = this.topSpeed(input.run && this.load !== 'large');
    const tx = (f * c - r * s) * top;
    const tz = (f * s + r * c) * top;
    const k = this.grounded || this.swimming ? 1 - Math.exp(-h / 0.075) : 1 - Math.exp(-h / 0.6);
    this.vx += (tx - this.vx) * k;
    this.vz += (tz - this.vz) * k;

    // ---- slope: too steep to climb, and one slides down it
    this.sliding = false;
    this.slope = 0;
    if (this.grounded && !this.swimming && !this.onFloor) {
      const e = 0.25;
      const gx = (this.landAt(this.x + e, this.z, this.y) - this.landAt(this.x - e, this.z, this.y)) / (2 * e);
      const gz = (this.landAt(this.x, this.z + e, this.y) - this.landAt(this.x, this.z - e, this.y)) / (2 * e);
      const g = Math.hypot(gx, gz);
      this.slope = Math.atan(g);
      if (g > TAN_SLOPE) {
        this.sliding = true;
        const nx = gx / g;
        const nz = gz / g;
        // no way up it…
        const up = this.vx * nx + this.vz * nz;
        if (up > 0) {
          this.vx -= nx * up;
          this.vz -= nz * up;
        }
        // …and down it one goes, faster the steeper
        const sinA = g / Math.sqrt(1 + g * g);
        const down = FOOT.gravity * (sinA - 0.55);
        this.vx -= nx * Math.max(1.2, down) * h * 4;
        this.vz -= nz * Math.max(1.2, down) * h * 4;
        const v = Math.hypot(this.vx, this.vz);
        if (v > 4) {
          this.vx *= 4 / v;
          this.vz *= 4 / v;
        }
      }
    }

    // ---- move across the plan in short pieces, kept out of solids
    const dx = this.vx * h;
    const dz = this.vz * h;
    const dist = Math.hypot(dx, dz);
    this.gather(this.x, this.z, FOOT.radius + dist + 0.6);
    const n = Math.max(1, Math.ceil(dist / (FOOT.radius / 3)));
    const x0 = this.x;
    const z0 = this.z;
    for (let i = 0; i < n; i++) {
      this.x += dx / n;
      this.z += dz / n;
      this.resolve();
      // the feet follow the ground between the pieces so a step met half way is walked up
      if (this.grounded && !this.swimming) {
        const sup = this.supportAt(this.x, this.z, this.y);
        if (sup <= this.y + FOOT.step + 1e-6 && sup >= this.y - SNAP_DOWN) this.setFeet(sup);
      }
    }
    this.walked += Math.hypot(this.x - x0, this.z - z0);

    // ---- up and down
    const sup = this.supportAt(this.x, this.z, this.y);
    this.updateWater(sup);
    if (this.swimming) {
      // float with the feet `swimDepth` under the surface (falling in from above first comes down to it)
      const target = Math.max(this.wl - FOOT.swimDepth, sup);
      if (this.y > target + 0.05) {
        this.vy -= FOOT.gravity * h;
        this.y = Math.max(target, this.y + this.vy * h);
      } else {
        this.vy = 0;
        this.y += (target - this.y) * (1 - Math.exp(-h / 0.25));
      }
      this.grounded = false;
    } else if (this.grounded) {
      if (sup >= this.y - SNAP_DOWN) this.setFeet(sup);
      else {
        this.grounded = false; // walked off an edge
        this.vy = 0;
      }
    } else {
      this.vy -= FOOT.gravity * h;
      this.y += this.vy * h;
      if (this.y <= sup) {
        this.y = sup;
        this.vy = 0;
        this.grounded = true;
      }
    }
    if (this.y < sup) this.y = sup;
    // coming down past the edge of a floor (or onto lower ground) can bring a solid into the way: out of it again
    this.resolve();
    if (input.jump) {
      input.jump = false;
      if (this.grounded && !this.swimming && this.load !== 'large' && !this.sliding) {
        this.vy = JUMP_V;
        this.grounded = false;
      }
    }

    // ---- the eye: eased height, eased steps, a slow bob
    const tk = 1 - Math.exp(-h / 0.16);
    this.eyeH += (this.targetEyeH() - this.eyeH) * tk;
    this.stepOff *= Math.exp(-h / 0.11);
    const v = Math.hypot(this.vx, this.vz);
    const want = this.bobOn && this.grounded && !this.swimming && v > 0.2 ? Math.min(FOOT.bobMax, FOOT.bob * (v / FOOT.walk)) : 0;
    this.bobAmp += (want - this.bobAmp) * (1 - Math.exp(-h / 0.3));
    // one bob per step; the phase runs over two steps so the sway of the hands (left, right) has its own half rate
    const cadence = (FOOT.cadence + FOOT.cadencePerMs * v) * (v / (v + 0.3));
    this.bobPhase = (this.bobPhase + cadence * h * Math.PI * 2) % (Math.PI * 4);
  }

  /** move the feet to y; a sudden change (a step, a snap down) is taken out of the eye and eased back in */
  private setFeet(y: number): void {
    const d = y - this.y;
    if (d > 0.03 || d < -0.03) this.stepOff -= d;
    this.y = y;
  }

  private updateWater(sup = this.supportAt(this.x, this.z, this.y)): void {
    this.landAt(this.x, this.z, this.y);
    const wl = this.wl;
    this.depth = wl > sup ? wl - sup : 0;
    this.swimming = this.depth > FOOT.swimDepth;
    if (this.swimming) this.crouched = false;
  }

  /** push the body out of every solid in its way (a few passes for corners) */
  private resolve(): void {
    const p = this.push;
    for (let it = 0; it < 4; it++) {
      let moved = false;
      for (const s of this.near) {
        if (!this.blocks(s, this.y)) continue;
        if (!pushOut(s, this.x, this.z, FOOT.radius, p)) continue;
        this.x = p.x;
        this.z = p.z;
        // what was going into it stops
        const vn = this.vx * p.nx + this.vz * p.nz;
        if (vn < 0) {
          this.vx -= p.nx * vn;
          this.vz -= p.nz * vn;
        }
        moved = true;
      }
      if (!moved) return;
    }
  }

  private headroomFor(height: number): boolean {
    this.gather(this.x, this.z, FOOT.radius + 0.5);
    for (const s of this.near) if (this.blocks(s, this.y, height) && pushOut(s, this.x, this.z, FOOT.radius, this.push)) return false;
    return true;
  }

  private targetEyeH(): number {
    return this.swimming ? FOOT.eyeSwim : this.crouched ? FOOT.eyeCrouch : FOOT.eye;
  }

  /** inside a solid that is in the way (for the tests) */
  insideSolid(margin = 0.01): boolean {
    this.gather(this.x, this.z, FOOT.radius + 0.5);
    for (const s of this.near) if (this.blocks(s, this.y) && pushOut(s, this.x, this.z, FOOT.radius - margin, this.push)) return true;
    return false;
  }

  /** the eye point in the world (no allocation when `out` is given) */
  eye(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    out.x = this.x;
    out.z = this.z;
    out.y = this.y + this.eyeH + this.stepOff + this.bobAmp * Math.sin(this.bobPhase);
    return out;
  }

  /** the unit view direction (heading + pitch) */
  look(out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
    const cp = Math.cos(this.pitch);
    out.x = Math.cos(this.heading) * cp;
    out.y = Math.sin(this.pitch);
    out.z = Math.sin(this.heading) * cp;
    return out;
  }

  /** the side-to-side sway of the hands with the walk (−1…1 × amplitude), for the first-person held thing */
  get sway(): number {
    return this.bobAmp * Math.sin(this.bobPhase / 2);
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  toJSON(): FootState {
    return { x: this.x, y: this.y, z: this.z, heading: this.heading, pitch: this.pitch, vx: this.vx, vy: this.vy, vz: this.vz, grounded: this.grounded, swimming: this.swimming, crouched: this.crouched };
  }

  restore(s: FootState): this {
    this.x = s.x;
    this.y = s.y;
    this.z = s.z;
    this.heading = s.heading;
    this.pitch = s.pitch;
    this.vx = s.vx;
    this.vy = s.vy;
    this.vz = s.vz;
    this.grounded = s.grounded;
    this.swimming = s.swimming;
    this.crouched = s.crouched;
    this.eyeH = this.targetEyeH();
    this.stepOff = 0;
    return this;
  }
}
