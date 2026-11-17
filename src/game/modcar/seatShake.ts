/**
 * What the seat does to the eye on top of the head's own sway (docs/MODCAR.md §23). The sway is the shared
 * camera rig's (core/camera/rig.ts: the head leaning under braking and in the turns, heaving over a crest),
 * left as it is for the older game; this is ModCar's own, added after it:
 *  - the road coming up through the tyres and the seat: a fine buzz on asphalt, a hard chatter on gravel and over
 *    grass, more the faster one goes and the busier the suspension is (a washboard), and through a stiffer
 *    suspension more of it (a sport strut passes it on, a soft one soaks it up);
 *  - the engine on its mounts: a single or a twin at idle shaking the whole cab, a six or an eight hardly; a
 *    worn engine missing a beat now and then; the cab shuddering as the engine catches, jerking as it stalls;
 *  - the knocks: a kerb, a joint, a pothole's edge, the bump stops struck, a landing, the body grounding, a crash
 *    into something hard; each a jolt that rings out within half a second.
 * In the body's frame (+x forward, +y up, +z right): metres, and small turns in radians.
 */
import { SURFACES } from '../../core/world/ground';

/** what it reads off the simulation (a VehicleSim is one) */
export interface ShakeSim {
  readonly speed: number;
  readonly wheels: readonly { readonly contact: boolean; readonly surface: number }[];
  readonly feel: {
    readonly suspRms: number;
    readonly buzz: number;
    readonly thumps: number;
    readonly lastThump: number;
    readonly bottomOuts: number;
    readonly lastBottomOut: number;
    readonly landings: number;
    readonly lastLanding: number;
    readonly bodyHits: number;
    readonly lastBodyHit: number;
  };
  readonly hits: number;
  readonly lastHitSpeed: number;
}

/** the engine as the seat feels it */
export interface ShakeEngine {
  running: boolean;
  rpm: number;
  idle: number;
  cylinders: number;
  /** how often it misses a beat (0 … 1: a worn engine) */
  misfire: number;
}

/** the impact spring: how quickly a jolt rings (Hz) and how soon it dies away */
const JOLT_HZ = 5.5;
const JOLT_ZETA = 0.32;
/** the road's buzz: its two frequencies (Hz), as the seat and the head pass them on */
const ROAD_HZ = [7.3, 12.9];
/** eye movement (m) per metre of the surface's micro-roughness, at 20 m/s */
const ROAD_PER_ROUGH = 0.15;
/** and per m/s of the suspension's busy-ness (RMS compression speed) above the calm */
const ROAD_PER_SUSP = 0.006;
/** the engine's shake (m) at idle by cylinders: a thumper, a twin, a triple, a four, a six, an eight */
const ENGINE_AMP: Record<number, number> = { 1: 0.0011, 2: 0.0007, 3: 0.0004, 4: 0.00022, 5: 0.00016, 6: 0.0001, 8: 0.00008 };

/** a smooth noise: gradient noise in one dimension, about −1 … 1 */
function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const g = (k: number): number => {
    let h = (k * 374761393 + seed * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return ((h & 0xffff) / 0x8000 - 1) * 2;
  };
  const a = g(i) * f;
  const b = g(i + 1) * (f - 1);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export class SeatShake {
  /** offsets (body frame, m) and turns (rad: pitch + nose up, roll + right side down, yaw + left) */
  x = 0;
  y = 0;
  z = 0;
  pitch = 0;
  roll = 0;
  yaw = 0;
  /** how much of it there is (the settings: 0 none … 2 double) */
  scale = 1;
  /** how stiff the suspension is against stock (a sport strut passes more of the road on) */
  stiffness = 1;
  /** the last frame's parts (for the probes and the tests) */
  readonly parts = { road: 0, engine: 0, jolt: 0 };

  private t = 0;
  /** the jolt's spring: vertical (m), pitch and roll (rad), each with its speed */
  private jy = 0;
  private vy = 0;
  private jp = 0;
  private vp = 0;
  private jr = 0;
  private vr = 0;
  private seen: { thumps: number; bottomOuts: number; landings: number; bodyHits: number; hits: number } | null = null;
  private wasRunning: boolean | null = null;
  private missDue = 0;
  private sim: ShakeSim | null = null;
  private rand = 0x5eed;

  /** the jolts forgotten (another vehicle sat in, a teleport) */
  reset(): void {
    this.jy = this.vy = this.jp = this.vp = this.jr = this.vr = 0;
    this.seen = null;
    this.wasRunning = null;
    this.sim = null;
    this.x = this.y = this.z = this.pitch = this.roll = this.yaw = 0;
  }

  private random(): number {
    this.rand = (Math.imul(this.rand, 1664525) + 1013904223) | 0;
    return (this.rand >>> 8) / 16777216;
  }

  /**
   * A knock: the head kicked down (and the nose up or down, the cab rolled) by a jolt that peaks at about
   * `size` metres; `nod` the pitch it gives per metre, `tilt` the roll.
   */
  kick(size: number, nod = 0, tilt = 0): void {
    const w = 2 * Math.PI * JOLT_HZ;
    this.vy -= size * w;
    this.vp += size * nod * w;
    this.vr += size * tilt * w;
  }

  update(dt: number, sim: ShakeSim, engine: ShakeEngine | null): void {
    if (dt <= 0) return;
    if (dt > 0.05) dt = 0.05;
    this.t += dt;
    const f = sim.feel;
    // (another vehicle, or the first frame: what has happened so far is not felt)
    if (this.sim !== sim || !this.seen) {
      this.sim = sim;
      this.seen = { thumps: f.thumps, bottomOuts: f.bottomOuts, landings: f.landings, bodyHits: f.bodyHits, hits: sim.hits };
      this.wasRunning = engine?.running ?? false;
    }
    const s = this.seen;
    const side = (): number => (this.random() < 0.5 ? -1 : 1);
    // ---- the knocks
    if (f.thumps !== s.thumps) {
      s.thumps = f.thumps;
      const k = Math.min(1.5, f.lastThump / 6);
      this.kick(0.002 + 0.012 * k, 1.2 * side(), 0.8 * side());
    }
    if (f.bottomOuts !== s.bottomOuts) {
      s.bottomOuts = f.bottomOuts;
      this.kick(0.01 + 0.012 * Math.min(1, f.lastBottomOut / 3), 1.5 * side(), 0.6 * side());
    }
    if (f.landings !== s.landings) {
      s.landings = f.landings;
      this.kick(0.01 + 0.022 * Math.min(1, f.lastLanding / 4), -1.2, 0.4 * side());
    }
    if (f.bodyHits !== s.bodyHits) {
      s.bodyHits = f.bodyHits;
      this.kick(0.004 + 0.02 * Math.min(1, f.lastBodyHit / 3000), 1.5 * side(), 1.2 * side());
    }
    if (sim.hits !== s.hits) {
      s.hits = sim.hits;
      if (sim.lastHitSpeed > 1) this.kick(Math.min(0.035, 0.0025 * sim.lastHitSpeed), -2.0, 1.5 * side());
    }
    // ---- the engine catching, stalling, missing
    const running = !!engine?.running;
    if (this.wasRunning !== null && running !== this.wasRunning) this.kick(running ? 0.004 : 0.006, running ? 0.6 : -1.0, 1.4 * side());
    this.wasRunning = running;
    if (engine && running && engine.misfire > 0) {
      this.missDue -= dt * engine.misfire * 3;
      if (this.missDue <= 0) {
        this.missDue = 0.4 + this.random();
        this.kick(0.0015 + 0.002 * engine.misfire, 0.5 * side(), 1.6 * side());
      }
    }
    // the jolt's spring, a few sub-steps (stable at a low frame rate)
    const w = 2 * Math.PI * JOLT_HZ;
    const kk = w * w;
    const cc = 2 * JOLT_ZETA * w;
    const n = Math.max(1, Math.ceil(dt / 0.006));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.vy += (-kk * this.jy - cc * this.vy) * h;
      this.vp += (-kk * this.jp - cc * this.vp) * h;
      this.vr += (-kk * this.jr - cc * this.vr) * h;
      this.jy += this.vy * h;
      this.jp += this.vp * h;
      this.jr += this.vr * h;
    }
    // ---- the road
    let rough = 0;
    let nc = 0;
    for (const wh of sim.wheels) {
      if (!wh.contact) continue;
      rough += SURFACES[wh.surface]?.rough ?? 0;
      nc++;
    }
    rough = nc ? rough / nc : 0;
    const v = sim.speed;
    const pace = Math.min(1.6, v / 20) * Math.min(1, v / 3);
    const road = (ROAD_PER_ROUGH * rough * pace + ROAD_PER_SUSP * Math.max(0, f.suspRms - 0.05) + 0.0004 * f.buzz * Math.min(1, v / 10)) * Math.sqrt(Math.max(0.3, this.stiffness));
    const t = this.t;
    const ry = noise1(t * ROAD_HZ[0], 11) + 0.6 * noise1(t * ROAD_HZ[1], 23);
    const rp = noise1(t * ROAD_HZ[0] * 0.8, 37);
    const rr = noise1(t * ROAD_HZ[0] * 0.7, 41);
    // ---- the engine: its firing felt (folded down to what a frame can show), a rough idle more than revs
    let eng = 0;
    let ey = 0;
    let er = 0;
    if (engine && running) {
      const cyl = Math.max(1, Math.round(engine.cylinders));
      const base = ENGINE_AMP[cyl] ?? (cyl > 8 ? 0.00006 : ENGINE_AMP[4]);
      const over = Math.max(0, (engine.rpm - engine.idle) / Math.max(500, engine.idle * 4));
      eng = base * (0.45 + 0.55 / (1 + 3 * over));
      const fire = Math.min(15, ((engine.rpm / 60) * cyl) / 2);
      ey = Math.sin(t * 2 * Math.PI * fire) * 0.7 + 0.3 * noise1(t * 9, 53);
      er = noise1(t * fire * 0.5, 59);
    }
    const sc = this.scale;
    this.parts.road = road * sc;
    this.parts.engine = eng * sc;
    this.parts.jolt = Math.abs(this.jy) * sc;
    this.y = (road * ry + eng * ey + this.jy) * sc;
    this.x = (road * 0.3 * noise1(t * 6.1, 61) + eng * 0.4 * er) * sc;
    this.z = (road * 0.35 * noise1(t * 5.3, 67) + eng * 0.6 * er) * sc;
    this.pitch = (road * 0.9 * rp + this.jp) * sc;
    this.roll = (road * 1.1 * rr + eng * 2.2 * er + this.jr) * sc;
    this.yaw = road * 0.25 * noise1(t * 4.3, 71) * sc;
  }
}
