/**
 * The proving ground in play (docs/MODCAR.md §28): the vehicle one drives there read every frame (telemetry.ts),
 * the section's run timing and measuring itself (runs.ts), the last seconds kept for the live charts; the robot
 * driver at the wheel when asked (pilot.ts); and two builds run back to back on the same section — A, then B, the
 * vehicle set down at the start each time with cool brakes — and set back as it was after.
 */
import type { Build } from '../../core/modcar/types';
import type { ConeField } from '../../core/modcar/proving/cones';
import { HILL, sectionOf, type ProvingGround, type Section, type SectionId } from '../../core/modcar/proving/layout';
import { Pilot, type PilotOptions } from '../../core/modcar/proving/pilot';
import { Runs, type RunResult } from '../../core/modcar/proving/runs';
import { newCarState, readCar, Recent, type CarState } from '../../core/modcar/proving/telemetry';
import type { VehicleInput } from '../../core/vehicle/sim';
import type { ModVehicle } from './vehicle';

/** what the session needs of the game */
export interface SessionHost {
  readonly time: number;
  readonly seated: ModVehicle | null;
  readonly focus: ModVehicle | null;
  readonly proving: ProvingGround | null;
  readonly provingCones: ConeField | null;
  teleportTo(x: number, z: number, yaw: number, bring: boolean): void;
  /** a build put on a vehicle in place of its own (its parts swapped; its look and systems made again) */
  swapBuild(v: ModVehicle, b: Build): void;
  /** into the driver's seat of a vehicle */
  enter(v: ModVehicle): void;
}

/** the cones a section's run counts and sets up again */
const SECTION_CONES: Partial<Record<SectionId, ('skidpad' | 'slalom' | 'gate' | 'straight' | 'offroad')[]>> = {
  skidpad: ['skidpad'],
  slalom: ['slalom', 'gate'],
  offroad: ['offroad'],
  accel: ['straight'],
  brake: ['straight'],
};

/** a leg of a comparison: a build, run once on the section */
export interface Leg {
  label: 'A' | 'B';
  /** what it is, in a few words (the part tried, or "车上原来的样子") */
  what: string;
  build: Build;
  result: RunResult | null;
}

/** two builds on the same section, one after the other */
export interface Comparison {
  section: SectionId;
  robot: boolean;
  legs: [Leg, Leg];
  /** the leg running (0, 1), 2 when both are done */
  i: number;
  /** the build the vehicle had before (set back after) */
  back: Build;
  vehicle: ModVehicle;
  /** something went wrong ('' none) */
  why: string;
}

/** a comparison's rows: each figure both legs measured, B against A */
export interface CompareRow {
  key: string;
  zh: string;
  a: string;
  b: string;
  /** B − A as it reads (+12 %), and whether B is the better ('' / null when they are the same or it means nothing) */
  delta: string;
  better: boolean | null;
}

export class ProvingSession {
  readonly runs: Runs;
  readonly recent = new Recent(15, 30);
  readonly car: CarState = newCarState();
  /** the robot at the wheel (null: the player drives) */
  pilot: Pilot | null = null;
  /** how the robot drives (the slalom's speed, the brake test's, which ramp) */
  readonly robotOpts: PilotOptions = { slalomKmh: 0, brakeKmh: 100, ramp: 1 };
  /** the comparison running or last run */
  ab: Comparison | null = null;
  /** the vehicle being read (on the proving ground), else null */
  vehicle: ModVehicle | null = null;
  /** the robot waits this long after setting the vehicle down (the world built round it, the car settled) */
  private wait = 0;
  /** a leg's run ended: the next starts after this */
  private between = -1;
  /** the run's result shown, and since when (the game's clock) */
  shown: RunResult | null = null;
  shownAt = -Infinity;
  /** said once, to the player: what happened ('' none); taken by the HUD */
  news = '';

  constructor(private readonly host: SessionHost) {
    this.runs = new Runs(host.provingCones);
  }

  /** is a vehicle on the proving ground */
  on(v: ModVehicle | null): boolean {
    const pg = this.host.proving;
    return !!v && !!pg && pg.near(v.sim.px, v.sim.pz);
  }

  /** where a vehicle is set down for a section: its start (the grade hill's: before the ramp the robot is to climb) */
  startOf(id: SectionId): Section {
    const s = sectionOf(id);
    if (id !== 'hill') return s;
    const r = HILL.ramps[Math.max(0, Math.min(HILL.ramps.length - 1, this.robotOpts.ramp ?? 1))];
    return { ...s, z: r.z };
  }

  /** to a section with the vehicle at hand: set down at its start, its cones set up; the robot drives it there if `robot` */
  go(id: SectionId, robot: boolean): void {
    this.stopRobot();
    const s = this.startOf(id);
    this.host.teleportTo(s.x, s.z, s.yaw, true);
    const v = this.host.seated ?? this.host.focus;
    this.setUp(id, v);
    if (robot && v) this.startRobot(id, v);
  }

  private setUp(id: SectionId, v: ModVehicle | null): void {
    const g = SECTION_CONES[id];
    if (g) this.host.provingCones?.reset(g);
    if (v) {
      // (cool brakes for every run: the last one's heat is not this one's)
      v.sys.brakeHeat.fill(0);
      v.sim.setParkBrake(false);
    }
    this.recent.clear();
    // (the run arms itself when the vehicle is at its start)
    this.runs.current?.idle();
    this.runs.current = null;
  }

  private startRobot(id: SectionId, v: ModVehicle): void {
    if (this.host.seated !== v) this.host.enter(v);
    this.pilot = new Pilot(id, v.view.frame.body.halfWidth, this.robotOpts);
    this.wait = 1.5;
  }

  /** the robot let go (and any comparison stopped, the vehicle's own build back on it) */
  stopRobot(): void {
    this.pilot = null;
  }

  stopAll(): void {
    this.stopRobot();
    const ab = this.ab;
    if (ab && ab.i < 2) {
      this.host.swapBuild(ab.vehicle, structuredClone(ab.back));
      ab.why = ab.why || '停下了';
      ab.i = 2;
    }
  }

  /**
   * Two builds run on a section one after the other (the robot driving, or the player): A, then B, each set down
   * at the start; the vehicle's own build back on it after
   */
  compare(id: SectionId, a: { build: Build; what: string }, b: { build: Build; what: string }, robot: boolean): string {
    const v = this.host.seated ?? this.host.focus;
    if (!v) return '先坐进一辆车';
    if (a.build.frame !== b.build.frame || a.build.frame !== v.build.frame) return 'A 和 B 要是同一种车';
    this.stopAll();
    this.ab = {
      section: id,
      robot,
      legs: [
        { label: 'A', what: a.what, build: structuredClone(a.build), result: null },
        { label: 'B', what: b.what, build: structuredClone(b.build), result: null },
      ],
      i: 0,
      back: structuredClone(v.build),
      vehicle: v,
      why: '',
    };
    this.leg();
    return '';
  }

  /** the comparison's next leg: its build on, set down at the start */
  private leg(): void {
    const ab = this.ab;
    if (!ab || ab.i > 1) return;
    const v = ab.vehicle;
    this.host.swapBuild(v, structuredClone(ab.legs[ab.i].build));
    const s = this.startOf(ab.section);
    if (this.host.seated !== v) this.host.enter(v);
    this.host.teleportTo(s.x, s.z, s.yaw, true);
    this.setUp(ab.section, v);
    if (ab.robot) this.startRobot(ab.section, v);
    this.news = `${ab.legs[ab.i].label}：${ab.legs[ab.i].what}${ab.robot ? '（自动驾驶）' : '，开始吧'}`;
  }

  /** the pedals and the wheel for the vehicle sat in this frame, when the robot drives it (null: the player does) */
  input(dt: number, v: ModVehicle): VehicleInput | null {
    const p = this.pilot;
    if (!p || v !== (this.ab && this.ab.i < 2 ? this.ab.vehicle : this.host.seated)) return null;
    // (the engine running and in drive first)
    if (!v.sys.running) {
      v.sys.crank(true);
      this.wait = Math.max(this.wait, 0.3);
    } else v.sys.crank(false);
    if (v.sim.selector !== 'D') v.sim.shift('D');
    if (this.wait > 0) {
      this.wait -= dt;
      return { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
    }
    const cur = this.runs.current?.section === p.section ? this.runs.current.phase : this.runDoneFor(p.section) ? 'done' : null;
    const out = p.drive(dt, v.sim, cur);
    if (p.wantStop && this.runs.current?.section === p.section && this.runs.current.phase === 'running') {
      this.runs.stop(this.car);
      this.took(this.runs.justDone);
    }
    if (p.done) {
      this.pilot = null;
      // (a comparison's leg done: the next one)
      if (this.ab && this.ab.i < 2 && this.ab.legs[this.ab.i].result) this.between = 0.6;
    }
    return { ...out };
  }

  /** the section's run ended since the robot took the wheel */
  private runDoneFor(id: SectionId): boolean {
    return !!this.shown && this.shown.section === id && this.shown.at >= this.host.time - 30;
  }

  /** every frame, after the vehicles stepped */
  update(dt: number): void {
    // (got out while the robot drove: it lets go, and a comparison stops)
    if (this.pilot && !this.host.seated) this.stopAll();
    const v = this.host.seated;
    this.vehicle = this.on(v) ? v : null;
    if (!this.vehicle) {
      this.runs.step(null);
      return;
    }
    const s = this.vehicle.sys;
    readCar(this.vehicle.sim, this.host.time, s.dash.rpm, s.running, this.car);
    this.recent.add(this.car);
    this.runs.step(this.car);
    this.took(this.runs.justDone);
    // a comparison: the next leg after the last one's run (the player's: a moment to see it)
    const ab = this.ab;
    if (ab && ab.i < 2 && ab.legs[ab.i].result && !this.pilot) {
      if (this.between < 0) this.between = ab.robot ? 0.6 : 2.5;
      this.between -= dt;
      if (this.between <= 0) {
        this.between = -1;
        ab.i++;
        if (ab.i < 2) this.leg();
        else {
          this.host.swapBuild(ab.vehicle, structuredClone(ab.back));
          this.news = 'A、B 都跑完了，车换回原来的样子';
        }
      }
    }
  }

  /** a run ended: shown, and a comparison's leg's when it is one */
  private took(r: RunResult | null): void {
    if (!r) return;
    this.shown = r;
    this.shownAt = this.host.time;
    const ab = this.ab;
    if (ab && ab.i < 2 && r.section === ab.section && !ab.legs[ab.i].result) ab.legs[ab.i].result = r;
  }

  /** the comparison's rows (both legs' figures, B against A) */
  rows(): CompareRow[] {
    const ab = this.ab;
    const ra = ab?.legs[0].result;
    const rb = ab?.legs[1].result;
    if (!ra || !rb) return [];
    const out: CompareRow[] = [];
    for (const fa of ra.figures) {
      const fb = rb.figures.find((f) => f.key === fa.key);
      if (!fb) continue;
      let delta = '';
      let better: boolean | null = null;
      if (Number.isFinite(fa.value) && Number.isFinite(fb.value) && fa.value !== 0 && fa.better) {
        const c = (fb.value - fa.value) / Math.abs(fa.value);
        if (Math.abs(c) >= 0.005) {
          delta = `${c > 0 ? '+' : '−'}${Math.abs(c * 100).toFixed(c < 0.1 && c > -0.1 ? 1 : 0)}%`;
          better = fa.better === 'low' ? c < 0 : c > 0;
        }
      } else if (Number.isFinite(fa.value) !== Number.isFinite(fb.value)) delta = Number.isFinite(fb.value) ? '到了' : '没到';
      out.push({ key: fa.key, zh: fa.zh, a: fa.text, b: fb.text, delta, better });
    }
    return out;
  }
}
