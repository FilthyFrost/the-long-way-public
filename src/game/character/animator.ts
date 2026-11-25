// How she moves (docs/V3/plan/character-pv.md §5), in layers, each doing one thing:
//   1. locomotion — Painted Valley's way (src/figure/animator.js): idle, walk, jog, run and sprint blended by her real
//      speed, every loop on one shared gait phase (0 at the left heel's strike) advanced by the distance she covers
//      over the blended stride, so her feet never slide; strafing round a ring of eight directions when her body keeps
//      facing the view (first person); jumps; a lean into turns; the trunk kept about as upright as a runner's;
//   2. posture — crouching (the hips down, the feet kept where the clip puts them, the knees bending to match),
//      sitting in a seat (the hips on the cushion, the feet to the pedals, the back to the backrest);
//   3. the look — head, neck and chest toward where the view looks;
//   4. arms — two-bone IK to targets the game gives (the steering wheel's rim, a handle, what she holds);
//   5. fingers — grips (hands.ts);
//   6. feet on the ground under each of them.
// The game says each frame what she is doing (Drive); this poses her bones and nothing else.

import * as THREE from 'three';
import type { ClipSet } from './clips';
import type { HerRig } from './her';
import { type GripName, Hands, type Hold } from './hands';
import { clamp, damp, rotateWorld, rotateWorldQ, setWorldQ, twoBone } from './ik';

const wrap = (a: number) => ((a % 1) + 1) % 1;
const angleWrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface HandTarget {
  /** where the wrist goes (render space) */
  pos: THREE.Vector3;
  /** the hand's world rotation there (optional: else it keeps the arm's line) */
  rot?: THREE.Quaternion;
  grip: GripName;
  /** 0..1 */
  w: number;
  /** which way the elbow points (world direction) */
  pole?: THREE.Vector3;
  /** what the fingers close round (they stop where they touch it) */
  hold?: Hold;
}

export interface WheelGrip {
  /** the rim's centre and the wheel's plane (normal toward her), its 12 o'clock at angle 0, radius, the turn (rad, + to her left) */
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  radius: number;
  angle: number;
  /** the rim's tube radius (m) */
  tube?: number;
}

/** One handlebar grip: its middle and the way along it toward the bar's end (render space). */
export interface BarGrip {
  c: THREE.Vector3;
  out: THREE.Vector3;
}

export interface Drive {
  mode: 'foot' | 'seat';
  /** on foot: her feet; in a seat: the hip point on the cushion (render space) */
  pos: THREE.Vector3;
  /** render space, m/s */
  vel: THREE.Vector3;
  grounded: boolean;
  crouch: boolean;
  /** the view: yaw as the game measures it (facing cos, sin in x, z), pitch (+ up) */
  yaw: number;
  pitch: number;
  firstPerson: boolean;
  /** in a seat: which way the seat faces (the same yaw measure), and the floor under her feet (render y) */
  seatYaw?: number;
  floorY?: number;
  wheel?: WheelGrip;
  /** a motorcycle's handlebar grips: each one's middle and its axis outward (render space, as if it stood upright: the lean comes last) */
  bars?: { l: BarGrip; r: BarGrip };
  /** how far her seat leans (rad, + her right side down), about the line forward through rollPivot (render space) */
  seatRoll?: number;
  rollPivot?: THREE.Vector3;
  rollAxis?: THREE.Vector3;
  /** how hard the pedals are pressed (0..1) */
  throttle?: number;
  brake?: number;
  hands?: { l?: HandTarget; r?: HandTarget };
  /** the ground's height at a point (render space), for her feet */
  ground?: (x: number, z: number) => number;
}

interface ClipInfo {
  n: number;
  duration: number;
  /** left heel strike, as a share of the clip */
  offset: number;
  stride: number;
  feetL: THREE.Vector3[];
  feetR: THREE.Vector3[];
}

interface Layer { state: State; weight: number; fade: number }
interface State {
  kind: string;
  sample(dt: number, ctx: Ctx, live: boolean): { clip: string; w: number; time: number }[];
  done?: boolean;
}
interface Ctx { speed: number; moveAngle: number; strafe: boolean }

/** the clips used and the speeds (m/s, hers) their blend anchors sit at; set from the clips' own speeds */
const LOCO = { idle: 'Idle', walk: 'Walk', jog: 'Jog', run: 'Run', sprint: 'Sprint' };
const STRAFE: [number, string, string][] = [[0, 'Walk', 'Jog'], [45, 'Walk_Fwd_L', 'Jog_Fwd_L'], [90, 'Walk_L', 'Jog_L'], [135, 'Walk_Bwd_L', 'Walk_Bwd_L'], [180, 'Walk_Bwd', 'Walk_Bwd'], [-135, 'Walk_Bwd_R', 'Walk_Bwd_R'], [-90, 'Walk_R', 'Jog_R'], [-45, 'Walk_Fwd_R', 'Jog_Fwd_R']];

export class Animator {
  readonly mixer: THREE.AnimationMixer;
  readonly hands: Hands;
  readonly info: Record<string, ClipInfo> = {};
  private readonly actions: Record<string, THREE.AnimationAction> = {};
  private layers: Layer[] = [];
  private state: State;
  private phase = 0;
  private idleClock = 0;
  readonly speeds = { walk: 1.3, jog: 2.6, run: 4.6, sprint: 6.1, strafeWalk: 1.3, strafeJog: 2.6 };
  /** her body's facing (the game's yaw measure) */
  bodyYaw = 0;
  /** the riding pose: the back's lean (rad per spine bone), the hand's tip down (rad), palm-to-grip and wrist-to-palm (m) */
  readonly tune = { barLean: 0.3, barTip: 0.35, barPalm: 0.034, barWrist: 0.048, barR: 0.021, wheelPalm: 0.013, wheelPalmFwd: 0.25 };
  private lastYaw = 0;
  private lean = 0;
  private pitchLean = 0;
  private upright = 0;
  private crouchK = 0;
  /** how much of her own bearing is laid over the clips (0 in the air, in a seat) */
  private bearingK = 0;
  private seatK = 0;
  private air = 0;
  private landT = 9;
  private look = { yaw: 0, pitch: 0 };
  private lastVel = new THREE.Vector3();
  private readonly feetLock: Record<'l' | 'r', THREE.Vector3 | null> = { l: null, r: null };
  private turnT = 0;
  debug = '';
  /** layers turned off (for tests): 'sit', 'look', 'arms', 'hands', 'feet', 'crouch', 'lean' */
  readonly off = new Set<string>();
  /** where each hand's IK puts it this frame (for the first-person arms' tests) */
  readonly reach: Record<'l' | 'r', number> = { l: 0, r: 0 };
  private wheelHands = { l: 0, r: 0, rel: { l: 0, r: 0 } };

  constructor(readonly rig: HerRig, readonly clips: ClipSet) {
    this.mixer = new THREE.AnimationMixer(rig.root);
    for (const [name, clip] of Object.entries(clips.clips)) {
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(0);
      a.timeScale = 0;
      this.actions[name] = a;
    }
    this.analyze();
    // the blend anchors at the clips' own speeds
    const sp = (n: string, d: number) => clips.motion[n]?.speed || d;
    this.speeds.walk = sp('Walk', 1.3);
    this.speeds.jog = sp('Jog', 2.6);
    this.speeds.run = Math.max(this.speeds.jog + 0.5, sp('Run', 4.6));
    this.speeds.sprint = Math.max(this.speeds.run + 0.5, sp('Sprint', 6.1));
    this.speeds.strafeWalk = this.speeds.walk;
    this.speeds.strafeJog = this.speeds.jog;
    this.hands = new Hands(rig);
    this.state = this.loco();
    this.layers.push({ state: this.state, weight: 1, fade: 0.2 });
  }

  // ------------------------------------------------------------------------------------------ measuring the clips
  private analyze(): void {
    const rig = this.rig;
    // a bare copy of her bones to play each clip on
    const map = new Map<THREE.Bone, THREE.Bone>();
    const copy = (b: THREE.Bone): THREE.Bone => {
      const c = new THREE.Bone();
      c.name = b.name;
      c.position.copy(b.position);
      c.quaternion.copy(b.quaternion);
      map.set(b, c);
      for (const ch of b.children) if ((ch as THREE.Bone).isBone) c.add(copy(ch as THREE.Bone));
      return c;
    };
    const root = new THREE.Group();
    root.add(copy(rig.bones.root));
    const bones: Record<string, THREE.Bone> = {};
    root.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
    const mixer = new THREE.AnimationMixer(root);
    const p = new THREE.Vector3();
    for (const [name, clip] of Object.entries(this.clips.clips)) {
      const a = mixer.clipAction(clip);
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.play();
      const n = Math.max(2, Math.round(clip.duration * 30) + 1);
      const feetL: THREE.Vector3[] = [], feetR: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) {
        mixer.setTime((i / (n - 1)) * clip.duration);
        root.updateMatrixWorld(true);
        feetL.push(bones.foot_l.getWorldPosition(p).clone());
        feetR.push(bones.foot_r.getWorldPosition(p).clone());
      }
      a.stop();
      mixer.uncacheAction(clip);
      const motion = this.clips.motion[name];
      const info: ClipInfo = { n, duration: clip.duration, offset: 0, stride: motion.speed * clip.duration, feetL, feetR };
      if (/Walk|Jog|Run|Sprint/.test(name) && !/To_/.test(name)) {
        // the left foot's speed over the ground (its speed in place plus the clip's travel): the longest slow run
        const sp: number[] = [];
        for (let i = 0; i < n - 1; i++) {
          const d = feetL[i + 1].clone().sub(feetL[i]).multiplyScalar(30).add(motion.velocity);
          sp.push(Math.hypot(d.x, d.z));
        }
        const sorted = sp.slice().sort((x, y) => x - y);
        const slow = sorted[Math.floor(sorted.length * 0.4)] * 1.05 + 0.05;
        let best = 0, bestLen = 0;
        for (let i = 0; i < sp.length; i++) {
          if (sp[i] > slow || sp[(i - 1 + sp.length) % sp.length] <= slow) continue;
          let len = 0;
          while (len < sp.length && sp[(i + len) % sp.length] <= slow) len++;
          if (len > bestLen) { bestLen = len; best = i; }
        }
        info.offset = best / (n - 1);
      }
      this.info[name] = info;
    }
  }

  // ------------------------------------------------------------------------------------------ states
  private enter(state: State, fade = 0.2): void {
    for (const l of this.layers) l.fade = Math.max(l.fade, fade);
    this.layers.push({ state, weight: this.layers.length ? 0 : 1, fade });
    this.state = state;
  }

  private loco(): State {
    let last: Ctx | null = null;
    const st: State = {
      kind: 'loco',
      sample: (dt, ctx, live) => {
        if (live || !last) last = { ...ctx };
        return this.sampleLoco(dt, last, live);
      },
    };
    return st;
  }

  private sampleLoco(dt: number, ctx: Ctx, advance: boolean): { clip: string; w: number; time: number }[] {
    const sp = this.speeds;
    const v = ctx.speed;
    const out: { clip: string; w: number; synced: boolean }[] = [];
    const add = (clip: string, w: number, synced = true) => {
      if (w <= 1e-4 || !this.info[clip]) return;
      out.push({ clip, w, synced });
    };
    if (!ctx.strafe) {
      const k: [number, string][] = [[0, LOCO.idle], [sp.walk, LOCO.walk], [sp.jog, LOCO.jog], [sp.run, LOCO.run], [sp.sprint, LOCO.sprint]];
      if (v <= 0.02) add(LOCO.idle, 1, false);
      else {
        let i = 0;
        while (i < k.length - 2 && v > k[i + 1][0]) i++;
        const t = clamp((v - k[i][0]) / (k[i + 1][0] - k[i][0]), 0, 1);
        add(k[i][1], 1 - t, i > 0);
        add(k[i + 1][1], t, true);
      }
    } else {
      const walkW = clamp(v / sp.strafeWalk, 0, 1);
      const jogT = clamp((v - sp.strafeWalk) / (sp.strafeJog - sp.strafeWalk), 0, 1);
      add(LOCO.idle, 1 - walkW, false);
      this.dirBlend(STRAFE.map(([a, w]) => [a, w] as [number, string]), ctx.moveAngle, walkW * (1 - jogT), add);
      this.dirBlend(STRAFE.map(([a, , j]) => [a, j] as [number, string]), ctx.moveAngle, walkW * jogT, add);
    }
    const merged = new Map<string, { clip: string; w: number; synced: boolean }>();
    for (const o of out) {
      const m = merged.get(o.clip);
      if (m) m.w += o.w; else merged.set(o.clip, { ...o });
    }
    const list = [...merged.values()];
    let stride = 0, sw = 0;
    for (const o of list) if (o.synced) { stride += this.info[o.clip].stride * o.w; sw += o.w; }
    if (sw > 0 && advance) {
      stride /= sw;
      const cyc = stride > 0.05 ? v / stride : 0;
      this.phase = wrap(this.phase + cyc * dt);
    }
    return list.map((o) => {
      const info = this.info[o.clip];
      return { clip: o.clip, w: o.w, time: o.synced ? wrap(this.phase + info.offset) * info.duration : this.idleClock % info.duration };
    });
  }

  private dirBlend(ring: [number, string][], angle: number, w: number, add: (c: string, w: number) => void): void {
    if (w <= 1e-4) return;
    const deg = THREE.MathUtils.radToDeg(angleWrap(angle));
    const sorted = ring.map(([a, c]) => [((a % 360) + 360) % 360, c] as [number, string]).sort((x, y) => x[0] - y[0]);
    const d = ((deg % 360) + 360) % 360;
    for (let i = 0; i < sorted.length; i++) {
      const [a0, c0] = sorted[i];
      const [a1raw, c1] = sorted[(i + 1) % sorted.length];
      const a1 = a1raw <= a0 ? a1raw + 360 : a1raw;
      const dd = d < a0 ? d + 360 : d;
      if (dd >= a0 && dd <= a1) {
        const t = (dd - a0) / (a1 - a0);
        add(c0, w * (1 - t));
        add(c1, w * t);
        return;
      }
    }
  }

  private oneShot(kind: string, clip: string, from = 0, to = 1, rate = 1, loop = false): State {
    const info = this.info[clip];
    let u = from;
    const st: State = {
      kind,
      sample: (dt) => {
        u += (dt * rate) / info.duration;
        if (u >= to) {
          if (loop) u = from + wrap((u - from) / (to - from)) * (to - from);
          else { u = to; st.done = true; }
        }
        return [{ clip, w: 1, time: u * info.duration }];
      },
    };
    return st;
  }

  /** A held pose (one frame of a clip): sitting, a crouch's base. */
  private still(kind: string, clip: string, at: number): State {
    return { kind, sample: () => [{ clip, w: 1, time: at * this.info[clip].duration }] };
  }

  // ------------------------------------------------------------------------------------------ each frame
  private started = false;
  /**
   * The clips' pose from the last frame, before anything of ours was laid on it. three.js's mixer writes a bone only
   * when its value changes (PropertyMixer.apply), so a held pose (sitting) would keep last frame's turns and add this
   * frame's to them: every frame the bones go back to this first.
   */
  private readonly baseQ: THREE.Quaternion[] = [];
  private readonly baseP: THREE.Vector3[] = [];

  update(dt: number, d: Drive): void {
    const rig = this.rig;
    this.idleClock += dt;
    if (!this.started) {
      this.bodyYaw = this.lastYaw = d.mode === 'seat' ? d.seatYaw ?? d.yaw : d.yaw;
      this.started = true;
    }
    const seated = d.mode === 'seat';
    // ---- where she stands and which way her body faces
    const hv = Math.hypot(d.vel.x, d.vel.z);
    if (seated) {
      this.bodyYaw = d.seatYaw ?? d.yaw;
    } else if (d.firstPerson) {
      // her body keeps to the view: at once when she moves, when standing only once the view has turned well away
      const off = angleWrap(d.yaw - this.bodyYaw);
      if (hv > 0.3) this.bodyYaw += off * Math.min(1, dt * 10);
      else if (Math.abs(off) > 0.9 || this.turnT > 0) {
        this.turnT = Math.abs(off) > 0.05 ? 0.4 : Math.max(0, this.turnT - dt);
        this.bodyYaw += off * Math.min(1, dt * 6);
      }
    } else if (hv > 0.25) {
      // third person: she turns to face her way
      const want = Math.atan2(d.vel.z, d.vel.x);
      this.bodyYaw += angleWrap(want - this.bodyYaw) * Math.min(1, dt * 9);
    }
    this.bodyYaw = angleWrap(this.bodyYaw);
    const turnRate = angleWrap(this.bodyYaw - this.lastYaw) / Math.max(dt, 1e-3);
    this.lastYaw = this.bodyYaw;
    rig.root.position.copy(d.pos);
    rig.root.rotation.set(0, Math.PI / 2 - this.bodyYaw, 0);
    // ---- which state
    const fwd = new THREE.Vector3(Math.cos(this.bodyYaw), 0, Math.sin(this.bodyYaw));
    const moveAngle = hv > 0.05 ? angleWrap(Math.atan2(d.vel.z, d.vel.x) - this.bodyYaw) : 0;
    // (the game's yaw turns to her right as it grows: a move to her left is a negative difference; the ring has + left)
    const ctx: Ctx = { speed: seated ? 0 : hv, moveAngle: -moveAngle, strafe: !seated && d.firstPerson && Math.abs(moveAngle) > 0.35 };
    if (seated) {
      if (this.state.kind !== 'seat') this.enter(this.still('seat', LOCO.idle, 0.2), 0.25);
    } else if (!d.grounded && this.info.Jump_Loop) {
      this.air += dt;
      if (this.state.kind !== 'jump' && this.state.kind !== 'fall' && (d.vel.y > 0.5 || this.air > 0.25)) {
        this.enter(d.vel.y > 0.5 && this.info.Jump_Start ? this.oneShot('jump', 'Jump_Start', 0.25, 1, 1.4) : this.oneShot('fall', 'Jump_Loop', 0, 1, 1, true), 0.12);
      } else if (this.state.kind === 'jump' && this.state.done) this.enter(this.oneShot('fall', 'Jump_Loop', 0, 1, 1, true), 0.15);
    } else {
      if ((this.state.kind === 'jump' || this.state.kind === 'fall') && this.info.Jump_Land) {
        this.enter(this.oneShot('land', 'Jump_Land', 0, 1, 1.3), 0.08);
        this.landT = 0;
      }
      this.air = 0;
      this.landT += dt;
      if (this.state.kind === 'land' && (this.state.done || hv > 1.2 || this.landT > 0.35)) this.enter(this.loco(), 0.18);
      else if (this.state.kind !== 'loco' && this.state.kind !== 'land') this.enter(this.loco(), 0.25);
    }
    // ---- the clips: layers fade, each samples its clips
    for (const l of this.layers) {
      const k = dt / Math.max(1e-3, l.fade);
      l.weight = l === this.layers[this.layers.length - 1] ? Math.min(1, l.weight + k) : Math.max(0, l.weight - k);
    }
    this.layers = this.layers.filter((l, i) => l.weight > 0 || i === this.layers.length - 1);
    const total = this.layers.reduce((s, l) => s + l.weight, 0) || 1;
    const want = new Map<string, { w: number; time: number }>();
    for (const l of this.layers) {
      for (const p of l.state.sample(dt, ctx, l.state === this.state)) {
        const e = want.get(p.clip) ?? { w: 0, time: p.time };
        e.w += (p.w * l.weight) / total;
        e.time = p.time;
        want.set(p.clip, e);
      }
    }
    for (const [name, a] of Object.entries(this.actions)) {
      const e = want.get(name);
      if (e) { a.setEffectiveWeight(e.w); a.time = e.time; } else a.setEffectiveWeight(0);
    }
    const bones = rig.skeleton.bones;
    if (this.baseQ.length) for (let i = 0; i < bones.length; i++) { bones[i].quaternion.copy(this.baseQ[i]); bones[i].position.copy(this.baseP[i]); }
    this.mixer.update(0);
    for (let i = 0; i < bones.length; i++) {
      (this.baseQ[i] ??= new THREE.Quaternion()).copy(bones[i].quaternion);
      (this.baseP[i] ??= new THREE.Vector3()).copy(bones[i].position);
    }
    rig.root.updateMatrixWorld(true);
    this.debug = [...want.entries()].filter(([, e]) => e.w > 0.02).map(([n, e]) => `${n}:${e.w.toFixed(2)}`).join(' ');

    // ---- after the clips
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x); // her right
    const up = new THREE.Vector3(0, 1, 0);
    const accel = new THREE.Vector3().subVectors(d.vel, this.lastVel).divideScalar(Math.max(dt, 1e-3));
    this.lastVel.copy(d.vel);
    if (!seated) {
      this.uprightTrunk(dt, hv, fwd, right);
      const target = clamp(-turnRate * hv * 0.03, -0.2, 0.2);
      this.lean = damp(this.lean, target, 6, dt);
      this.pitchLean = damp(this.pitchLean, clamp(accel.dot(fwd) * 0.01, -0.06, 0.08), 5, dt);
      for (const [b, k] of [['spine_01', 0.35], ['spine_02', 0.35], ['spine_03', 0.3]] as [string, number][]) {
        rotateWorld(rig.bones[b], fwd, this.lean * k);
        rotateWorld(rig.bones[b], right, this.pitchLean * k);
      }
    }
    // her bearing: the clips' man's stance made a girl's
    this.bearingK = damp(this.bearingK, !seated && d.grounded ? 1 : 0, 8, dt);
    if (this.bearingK > 1e-3 && !this.off.has('bearing')) this.bearing(hv, fwd, right, up);
    // the fingers: loose when standing and walking, firmer as she runs (the clips' own fists are too tight)
    const fist = clamp((hv - 2) / 4, 0, 1);
    for (const s of ['l', 'r'] as const) if (!d.hands?.[s] && !(seated && d.wheel)) this.hands.grip(s, fist > 0.5 ? 'loose' : 'relaxed', 1, 0.25);
    // ---- crouching
    this.crouchK = damp(this.crouchK, d.crouch && !seated ? 1 : 0, 9, dt);
    if (this.crouchK > 1e-3) this.crouch(this.crouchK, fwd, right);
    // ---- sitting
    this.seatK = damp(this.seatK, seated ? 1 : 0, 12, dt);
    if (seated && !this.off.has('sit')) this.sit(d, fwd, right, up);
    // ---- the look
    if (!this.off.has('look')) this.lookToward(dt, d, fwd, right, up);
    // ---- arms to their targets (a seat's wheel, or the game's own)
    if (seated && d.wheel && !this.off.has('arms')) this.wheel(dt, d.wheel, fwd, right);
    if (seated && d.bars && !this.off.has('arms')) this.handlebars(d.bars, fwd, right, up);
    for (const s of ['l', 'r'] as const) {
      const t = d.hands?.[s];
      if (t && t.w > 0) this.armTo(s, t, fwd, right);
    }
    if (!this.off.has('hands')) this.hands.update(dt);
    // ---- feet on the ground
    if (!seated && d.grounded) this.placeFeet(dt, d, fwd);
    // a rider leans with her machine: all of her, rigidly, about the line its tyres meet the road on
    if (seated && d.seatRoll && d.rollPivot) {
      const q = new THREE.Quaternion().setFromAxisAngle(d.rollAxis ?? fwd, d.seatRoll);
      rig.root.position.sub(d.rollPivot).applyQuaternion(q).add(d.rollPivot);
      rig.root.quaternion.premultiply(q);
    }
    rig.root.updateMatrixWorld(true);
  }

  /**
   * Her bearing over the clips, which were made for a man (docs/V3/plan/character-pv.md §17). Standing, she stands
   * tall: her knees straight (her hips raised for it, her feet kept on the ground), her trunk upright with her chest a
   * little lifted, her shoulders down and a little back, her arms hanging close and easy, her feet together under her
   * hips with her knees forward. Walking, her feet fall nearer one line. Less of it as she crouches.
   */
  private bearing(hv: number, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const b = this.rig.bones;
    const w = this.bearingK * (1 - this.crouchK);
    if (w <= 1e-3) return;
    const still = w * (1 - clamp((hv - 0.15) / 1.0, 0, 1));
    const moving = w - still;
    const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
    // the trunk upright, the chest a little lifted (a turn about her right by + leans back)
    if (still > 1e-3) {
      const trunk = b.neck_01.getWorldPosition(v1).sub(b.pelvis.getWorldPosition(v2));
      const lean = Math.atan2(trunk.dot(fwd), trunk.y);
      const fix = clamp(lean - THREE.MathUtils.degToRad(-2), -0.1, 0.35) * still;
      rotateWorld(b.spine_01, right, fix * 0.3);
      rotateWorld(b.spine_02, right, fix * 0.35);
      rotateWorld(b.spine_03, right, fix * 0.35);
      rotateWorld(b.neck_01, right, -fix * 0.5);
    }
    for (const s of ['l', 'r'] as const) {
      const side = s === 'l' ? 1 : -1;
      // (her left is −right)
      const out = right.clone().multiplyScalar(-side);
      // the shoulders down and a little back
      rotateWorld(b[`clavicle_${s}`], fwd, -side * 0.06 * w);
      rotateWorld(b[`clavicle_${s}`], up, side * 0.05 * w);
      // the arms hanging close (about 7° out from her sides) and the elbows easy, standing; a little in, walking
      const sh = b[`upperarm_${s}`].getWorldPosition(v1), el = b[`lowerarm_${s}`].getWorldPosition(v2);
      const u = el.clone().sub(sh).normalize();
      const abd = Math.atan2(u.dot(out), -u.dot(up));
      const inAngle = clamp(abd - 0.12, 0, 0.6) * (still + moving * 0.5);
      rotateWorld(b[`upperarm_${s}`], fwd, -side * inAngle);
      if (still > 1e-3) {
        const elw = b[`lowerarm_${s}`].getWorldPosition(new THREE.Vector3()), wr = b[`hand_${s}`].getWorldPosition(new THREE.Vector3());
        const shw = b[`upperarm_${s}`].getWorldPosition(new THREE.Vector3());
        const ua = elw.clone().sub(shw).normalize(), fa = wr.clone().sub(elw).normalize();
        const flex = Math.acos(clamp(ua.dot(fa), -1, 1));
        const n = new THREE.Vector3().crossVectors(ua, fa);
        if (n.lengthSq() > 1e-8 && flex > 0.3) rotateWorld(b[`lowerarm_${s}`], n.normalize(), -(flex - 0.3) * 0.65 * still);
      }
    }
    // the feet together under her hips (standing) or nearer one line (walking); standing, the knees straight
    const pelvis = b.pelvis.getWorldPosition(new THREE.Vector3());
    const targets: THREE.Vector3[] = [];
    let raise = Infinity;
    for (const s of ['l', 'r'] as const) {
      const side = s === 'l' ? 1 : -1;
      const out = right.clone().multiplyScalar(-side);
      const foot = b[`foot_${s}`].getWorldPosition(new THREE.Vector3());
      const x = foot.clone().sub(pelvis).dot(out);
      const want = still * 0.06 + moving * Math.max(0.04, x * 0.65) + (1 - w) * x;
      const t = foot.addScaledVector(out, (want - x));
      targets.push(t);
      const hip = b[`thigh_${s}`].getWorldPosition(new THREE.Vector3());
      const L = hip.distanceTo(b[`calf_${s}`].getWorldPosition(new THREE.Vector3())) + b[`calf_${s}`].getWorldPosition(new THREE.Vector3()).distanceTo(b[`foot_${s}`].getWorldPosition(new THREE.Vector3()));
      // how far the hips may rise before this leg is straight (all but a whisker)
      const dxz = Math.hypot(t.x - hip.x, t.z - hip.z);
      const reachY = Math.sqrt(Math.max(0, (L * 0.992) ** 2 - dxz * dxz));
      raise = Math.min(raise, reachY - (hip.y - t.y));
    }
    if (still > 1e-3 && raise > 0) {
      const pw = b.pelvis.getWorldPosition(new THREE.Vector3());
      pw.y += Math.min(raise, 0.05) * still;
      b.pelvis.position.copy(b.pelvis.parent!.worldToLocal(pw));
      b.pelvis.updateMatrixWorld(true);
    }
    (['l', 'r'] as const).forEach((s, i) => {
      const fq = b[`foot_${s}`].getWorldQuaternion(new THREE.Quaternion());
      twoBone(b[`thigh_${s}`], b[`calf_${s}`], b[`foot_${s}`], targets[i], fwd, 1);
      setWorldQ(b[`foot_${s}`], fq);
    });
  }

  private uprightTrunk(dt: number, speed: number, fwd: THREE.Vector3, right: THREE.Vector3): void {
    const b = this.rig.bones;
    const trunk = b.neck_01.getWorldPosition(new THREE.Vector3()).sub(b.pelvis.getWorldPosition(new THREE.Vector3()));
    const lean = Math.atan2(trunk.dot(fwd), trunk.y);
    const k = [[0, 4], [1.3, 6], [4.6, 11], [6.1, 14]];
    let want = k[k.length - 1][1];
    for (let i = 0; i < k.length - 1; i++) if (speed <= k[i + 1][0]) { want = k[i][1] + ((speed - k[i][0]) / (k[i + 1][0] - k[i][0])) * (k[i + 1][1] - k[i][1]); break; }
    const moving = clamp((speed - 0.4) / 1.0, 0, 1);
    const extra = clamp(lean - THREE.MathUtils.degToRad(want), 0, THREE.MathUtils.degToRad(22)) * moving;
    this.upright = damp(this.upright, extra, 8, dt);
    for (const n of ['spine_01', 'spine_02', 'spine_03']) rotateWorld(b[n], right, this.upright * 0.45);
    rotateWorld(b.neck_01, right, -this.upright * 0.45);
  }

  /** Down on her haunches: the hips drop, the feet stay where the clip has them, the back leans over the knees. */
  private crouch(k: number, fwd: THREE.Vector3, right: THREE.Vector3): void {
    const b = this.rig.bones;
    const feet = (['l', 'r'] as const).map((s) => b[`foot_${s}`].getWorldPosition(new THREE.Vector3()));
    const pelvis = b.pelvis;
    const pw = pelvis.getWorldPosition(new THREE.Vector3());
    pw.y -= 0.36 * k;
    pw.addScaledVector(fwd, -0.06 * k);
    pelvis.position.copy(pelvis.parent!.worldToLocal(pw));
    pelvis.updateMatrixWorld(true);
    // (a turn about her right by + leans back)
    rotateWorld(b.pelvis, right, -0.35 * k);
    rotateWorld(b.spine_01, right, -0.12 * k);
    rotateWorld(b.spine_02, right, -0.1 * k);
    rotateWorld(b.neck_01, right, 0.35 * k);
    (['l', 'r'] as const).forEach((s, i) => {
      const side = s === 'l' ? -1 : 1; // (her left is −right)
      const pole = fwd.clone().addScaledVector(right, side * 0.35).normalize();
      twoBone(b[`thigh_${s}`], b[`calf_${s}`], b[`foot_${s}`], feet[i], pole, 1);
    });
  }

  /** In a seat: the hips on the cushion, the back against the backrest, the feet on the pedals or the floor. */
  private sit(d: Drive, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const b = this.rig.bones;
    // the pelvis bone sits a little above and behind the hip point (where the thighs meet the cushion)
    const pelvis = b.pelvis;
    const pw = d.pos.clone().addScaledVector(up, 0.06).addScaledVector(fwd, -0.02);
    pelvis.position.copy(pelvis.parent!.worldToLocal(pw));
    pelvis.updateMatrixWorld(true);
    // the trunk upright with a little recline, the pelvis rolled back as it is sitting
    const rel = (bone: THREE.Bone, axis: THREE.Vector3, a: number) => { if (!this.off.has('sitturn')) rotateWorld(bone, axis, a); };
    rel(b.pelvis, right, -0.12);
    rel(b.spine_01, right, 0.06);
    rel(b.spine_02, right, 0.04);
    rel(b.spine_03, right, 0.02);
    // feet: forward and down to the pedals (right) and the floor or the clutch (left)
    const floor = d.floorY ?? d.pos.y - 0.3;
    for (const s of ['l', 'r'] as const) {
      const side = s === 'l' ? -1 : 1;
      const hip = b[`thigh_${s}`].getWorldPosition(new THREE.Vector3());
      const press = s === 'r' ? Math.max(d.throttle ?? 0, (d.brake ?? 0) * 0.8) : 0;
      const reach = d.bars ? 0.2 : 0.62 + 0.05 * press;
      const foot = hip.clone().addScaledVector(fwd, reach).addScaledVector(right, side * (d.bars ? 0.13 : s === 'r' ? 0.02 : 0.03));
      foot.y = d.bars ? hip.y - 0.4 : floor + 0.085 + 0.02 * press;
      const pole = fwd.clone().multiplyScalar(0.6).addScaledVector(up, 0.8).addScaledVector(right, side * 0.12).normalize();
      // the thigh goes forward first (it lies along the cushion), then the IK finds the knee
      if (!this.off.has('sitlegs')) twoBone(b[`thigh_${s}`], b[`calf_${s}`], b[`foot_${s}`], foot, pole, 1);
      // the foot level on the pedal, its toes up a little
      const fq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), fwd.clone().addScaledVector(up, 0.35).multiplyScalar(-1), up));
      const restFoot = this.rig.bind[`foot_${s}`];
      void restFoot;
      void fq;
    }
  }

  private lookToward(dt: number, d: Drive, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const b = this.rig.bones;
    const yawOff = clamp(-angleWrap(d.yaw - this.bodyYaw), -1.2, 1.2);
    const behind = Math.abs(angleWrap(d.yaw - this.bodyYaw)) > 2.2 && !d.firstPerson;
    // (first person: at once — the eye is the camera, and a head that came after carried the view on for half a second
    // after the mouse had stopped, the mark with it; seen from outside it turns as a head does)
    if (d.firstPerson) {
      this.look.yaw = yawOff;
      this.look.pitch = clamp(d.pitch, -1.1, 0.9);
    } else {
      this.look.yaw = damp(this.look.yaw, behind ? 0 : yawOff, 8, dt);
      this.look.pitch = damp(this.look.pitch, clamp(d.pitch, -1.1, 0.9), 8, dt);
    }
    // first person: her head follows the view wholly (the eye is the camera); third person: a share of it
    const k = d.firstPerson ? 1 : 0.6;
    const yaw = this.look.yaw * k, pitch = this.look.pitch * k;
    const rightL = right.clone().applyAxisAngle(up, yaw);
    for (const [n, s] of [['spine_03', 0.15], ['neck_01', 0.35], ['Head', 0.5]] as [string, number][]) {
      rotateWorld(b[n], up, yaw * s);
      // (the game's pitch is + up, - down; a turn about her right by + tips her back: down tips her forward)
      rotateWorld(b[n], rightL, pitch * s);
    }
  }

  /** Both hands on the steering wheel: at nine and three, turning with it; past a quarter turn one lets go and takes a new hold. */
  private wheel(dt: number, w: WheelGrip, fwd: THREE.Vector3, right: THREE.Vector3): void {
    const side = new THREE.Vector3().crossVectors(w.up, w.normal).normalize(); // the wheel's own "right" (her right when it faces her)
    const wh = this.wheelHands;
    for (const s of ['l', 'r'] as const) {
      // where on the rim the hand holds, relative to the wheel's turn: nine o'clock for the left, three for the right
      const home = s === 'l' ? Math.PI / 2 : -Math.PI / 2;
      let rel = wh.rel[s];
      // the hand rides the rim with the wheel; when it has been carried too far it lets go and comes back
      const onRim = angleWrap(home + 0 - (rel + w.angle));
      if (Math.abs(rel + w.angle - home) > 1.3) {
        rel = home - w.angle;
        wh[s] = 0.25;
      }
      wh.rel[s] = rel;
      void onRim;
      wh[s] = Math.max(0, wh[s] - dt);
      const a = rel + w.angle;
      // a point on the rim at angle a (0 at twelve, + toward her left)
      const rimDir = w.up.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, -Math.sin(a));
      const tangent = w.up.clone().multiplyScalar(-Math.sin(a)).addScaledVector(side, -Math.cos(a));
      const grip = w.center.clone().addScaledVector(rimDir, w.radius);
      // the hand round the rim from outside it: the palm on its outer edge toward the wheel's middle, the fingers away
      // from her over it and round its front, the thumb round its back. While it changes its hold it lifts off and
      // comes down again.
      const tube = w.tube ?? 0.013;
      const lift = wh[s] > 0 ? Math.sin((wh[s] / 0.25) * Math.PI) * 0.05 : 0;
      const k = this.tune;
      const palm = rimDir.clone().negate().addScaledVector(w.normal, -k.wheelPalmFwd).normalize();
      const fingers = w.normal.clone().negate().addScaledVector(palm, w.normal.dot(palm)).normalize();
      const palmMid = grip.clone().addScaledVector(palm, -(tube + k.wheelPalm));
      const wrist = palmMid.addScaledVector(fingers, -k.barWrist).addScaledVector(w.normal, lift);
      const pole = rimDir.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, -1, 0)).addScaledVector(fwd, -0.2).normalize();
      const hold = wh[s] > 0.05 ? undefined : { kind: 'cyl' as const, c: grip, axis: tangent, r: tube };
      this.armTo(s, { pos: wrist, rot: handFrame(s, fingers, palm, w.normal), grip: wh[s] > 0.05 ? 'loose' : 'wheel', w: 1, pole, hold }, fwd, right);
    }
  }

  /**
   * On a motorcycle: both hands round the grips (the index finger inboard, the thumb under), the back of the hand up
   * and the wrist a little above and behind the grip; the elbows out and down; the back leaning toward the bars.
   */
  private handlebars(bars: { l: BarGrip; r: BarGrip }, fwd: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
    const b = this.rig.bones;
    // (from the hips, the back fairly straight: the lowest of the spine takes most of it; the head stays up)
    const lean = this.tune.barLean;
    rotateWorld(b.spine_01, right, -lean * 0.72);
    rotateWorld(b.spine_02, right, -lean * 0.2);
    rotateWorld(b.spine_03, right, -lean * 0.08);
    rotateWorld(b.neck_01, right, lean * 0.45);
    rotateWorld(b.Head, right, lean * 0.2);
    for (const s of ['l', 'r'] as const) {
      const side = s === 'l' ? -1 : 1;
      const g = bars[s];
      // the plane across the grip: forward and up as seen along it
      const n1 = fwd.clone().addScaledVector(g.out, -fwd.dot(g.out)).normalize();
      const n2 = new THREE.Vector3().crossVectors(g.out, n1).multiplyScalar(side);
      if (n2.dot(up) < 0) n2.negate();
      // the hand's length tipped down a little; the palm over the grip, its middle on it
      const tip = this.tune.barTip;
      const fingers = n1.clone().multiplyScalar(Math.cos(tip)).addScaledVector(n2, -Math.sin(tip));
      const palm = n1.clone().multiplyScalar(-Math.sin(tip)).addScaledVector(n2, -Math.cos(tip));
      const palmMid = g.c.clone().addScaledVector(palm, -this.tune.barPalm).addScaledVector(g.out, -0.006);
      const wrist = palmMid.addScaledVector(fingers, -this.tune.barWrist);
      const pole = up.clone().multiplyScalar(-0.5).addScaledVector(right, side).addScaledVector(fwd, -0.2).normalize();
      this.armTo(s, { pos: wrist, rot: handFrame(s, fingers, palm, palm), grip: 'bar', w: 1, pole, hold: { kind: 'cyl', c: g.c, axis: g.out, r: this.tune.barR } }, fwd, right);
    }
  }

  /** An arm to a target: the shoulder helps a little, the elbow points as asked, the hand turns to the given frame. */
  armTo(s: 'l' | 'r', t: HandTarget, fwd: THREE.Vector3, right: THREE.Vector3): void {
    const b = this.rig.bones;
    const side = s === 'l' ? -1 : 1;
    const pole = t.pole ?? new THREE.Vector3(0, -1, 0).addScaledVector(right, side * 0.5).addScaledVector(fwd, -0.3).normalize();
    // the collarbone swings the shoulder toward a far target (forward, up or down): up to a few centimetres
    const sh = b[`upperarm_${s}`].getWorldPosition(new THREE.Vector3());
    const reach = t.pos.distanceTo(sh);
    const extra = clamp(reach - 0.4, 0, 0.12);
    if (extra > 0) {
      const clav = b[`clavicle_${s}`];
      const root = clav.getWorldPosition(new THREE.Vector3());
      const along = sh.clone().sub(root);
      const axis = new THREE.Vector3().crossVectors(along, t.pos.clone().sub(root));
      if (axis.lengthSq() > 1e-10) rotateWorldQ(clav, new THREE.Quaternion().setFromAxisAngle(axis.normalize(), (extra / 0.12) * 0.42));
    }
    this.reach[s] = twoBone(b[`upperarm_${s}`], b[`lowerarm_${s}`], b[`hand_${s}`], t.pos, pole, t.w);
    if (t.rot) {
      const hand = b[`hand_${s}`];
      const cur = hand.getWorldQuaternion(new THREE.Quaternion());
      setWorldQ(hand, cur.slerp(t.rot, t.w));
    }
    this.twist(s);
    this.hands.grip(s, t.grip, t.w);
    this.hands.hold(s, t.hold);
  }

  /** The forearm's twist bone takes half the hand's turn about the forearm (no wringing at the wrist). */
  twist(s: 'l' | 'r'): void {
    const b = this.rig.bones;
    const lower = b[`lowerarm_${s}`], hand = b[`hand_${s}`], tw = b[`lowerarm_twist_${s}`];
    if (!tw) return;
    // the hand's local rotation's twist about the forearm's axis (local y)
    const q = hand.quaternion.clone().premultiply(this.rig.bind[hand.name].clone().invert());
    const twist = new THREE.Quaternion(0, q.y, 0, q.w).normalize();
    tw.quaternion.identity().slerp(twist, 0.5);
    void lower;
  }

  private placeFeet(dt: number, d: Drive, fwd: THREE.Vector3): void {
    if (!d.ground) return;
    const b = this.rig.bones;
    const rootY = d.pos.y;
    const offs: Record<string, number> = {};
    for (const s of ['l', 'r'] as const) {
      const ankle = b[`foot_${s}`].getWorldPosition(new THREE.Vector3());
      const ball = b[`ball_${s}`].getWorldPosition(new THREE.Vector3());
      const gy = Math.max(d.ground(ankle.x, ankle.z), d.ground(ball.x, ball.z));
      const lift = ankle.y - rootY;
      const planted = clamp(1 - (lift - 0.11) / 0.1, 0, 1);
      offs[s] = clamp(gy - rootY, -0.4, 0.4) * planted + clamp(gy + 0.1 - ankle.y, 0, 0.4) * (1 - planted);
    }
    const drop = Math.min(0, offs.l, offs.r);
    if (Math.abs(offs.l) + Math.abs(offs.r) < 1e-3) return;
    const pelvis = b.pelvis;
    const pw = pelvis.getWorldPosition(new THREE.Vector3());
    pw.y += drop;
    pelvis.position.copy(pelvis.parent!.worldToLocal(pw));
    pelvis.updateMatrixWorld(true);
    for (const s of ['l', 'r'] as const) {
      const foot = b[`foot_${s}`];
      const target = foot.getWorldPosition(new THREE.Vector3());
      target.y += offs[s] - drop + drop;
      const fq = foot.getWorldQuaternion(new THREE.Quaternion());
      twoBone(b[`thigh_${s}`], b[`calf_${s}`], foot, target, fwd, 1);
      setWorldQ(foot, fq);
    }
    void dt;
  }
}

/** A hand's world rotation from where its fingers point (`fingers`), which way its palm faces, and a hint for its back. */
export function handFrame(s: 'l' | 'r', fingers: THREE.Vector3, palm: THREE.Vector3, _hint: THREE.Vector3): THREE.Quaternion {
  // the hand's frame: +y along the fingers; the left's +x is out of the palm, the right's out of its back
  const y = fingers.clone().normalize();
  const x = palm.clone().addScaledVector(y, -palm.dot(y)).normalize();
  if (s === 'r') x.negate();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
