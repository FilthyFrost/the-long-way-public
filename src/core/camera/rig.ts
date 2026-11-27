/**
 * First-person camera rig. The head is a small spring–damper mass on the seat:
 * it leans back under acceleration, forward under braking, and only follows part of the
 * body's roll and pitch, so the cabin moves around you while the horizon stays calm.
 *
 * Output frame matches the vehicle body frame (+x forward, +y up, +z right);
 * the renderer converts to its own camera convention.
 */
import { clamp } from '../math/util';
import { GRAVITY, type Pose, type VehicleSim } from '../vehicle/sim';

export interface RigTuning {
  /** head displacement per m/s² of horizontal specific force (m) */
  leanPerMs2: number;
  maxLean: number;
  /** vertical displacement per m/s² of heave (m) */
  heavePerMs2: number;
  headHz: number;
  headZeta: number;
  /** fraction of body pitch / roll the view follows */
  pitchFollow: number;
  rollFollow: number;
  /** smoothing time for pitch/roll (s) */
  orientTau: number;
  /** view yaws into the turn: rad per rad/s of yaw rate, clamped */
  lookAhead: number;
  lookAheadMax: number;
  lookAheadTau: number;
  /** resting downward tilt of the gaze (rad, negative = down): shows the road and the gauges */
  basePitch: number;
  /** vertical field of view (deg) and the extra added at speed */
  baseFov: number;
  fovKick: number;
  fovSpeed: number;
}

export const DEFAULT_RIG: RigTuning = {
  leanPerMs2: 0.0055,
  maxLean: 0.045,
  heavePerMs2: 0.0035,
  headHz: 2.2,
  headZeta: 0.8,
  pitchFollow: 0.8,
  rollFollow: 0.55,
  orientTau: 0.09,
  lookAhead: 0.2,
  lookAheadMax: 0.13,
  lookAheadTau: 0.25,
  basePitch: -0.065,
  // (Nomad Drive's view in a seat is its view on foot, 70°, with nothing added at speed)
  baseFov: 70,
  fovKick: 0,
  fovSpeed: 27,
};

export class FirstPersonRig {
  tuning: RigTuning;
  // outputs
  x = 0;
  y = 0;
  z = 0;
  qx = 0;
  qy = 0;
  qz = 0;
  qw = 1;
  fov = 62;
  /** player free-look offsets (rad): yaw + = look right, pitch + = look up */
  lookYaw = 0;
  lookPitch = 0;
  /**
   * Somewhere other than the driver's seat (body frame): another seat, a spot to take pictures from,
   * or the walker's eye. yaw + = right, pitch + = up; it replaces the driver's resting tilt and the
   * look into corners. null = the driver's eye (spec.eye).
   */
  seat: { x: number; y: number; z: number; yaw: number; pitch: number } | null = null;

  private ox = 0;
  private oy = 0;
  private oz = 0;
  private ovx = 0;
  private ovy = 0;
  private ovz = 0;
  private pitchS = 0;
  private rollS = 0;
  private aheadS = 0;
  private started = false;
  private readonly b = new Float64Array(9);

  constructor(tuning: RigTuning = DEFAULT_RIG) {
    this.tuning = tuning;
    this.fov = tuning.baseFov;
  }

  reset(): void {
    this.ox = this.oy = this.oz = 0;
    this.ovx = this.ovy = this.ovz = 0;
    this.aheadS = 0;
    this.started = false;
  }

  /**
   * @param pose optional render pose (interpolated); defaults to the vehicle's current physics pose
   */
  update(dt: number, veh: VehicleSim, pose?: Pose): void {
    const t = this.tuning;
    if (dt > 0.05) dt = 0.05;
    const qx = pose ? pose.qx : veh.qx;
    const qy = pose ? pose.qy : veh.qy;
    const qz = pose ? pose.qz : veh.qz;
    const qw = pose ? pose.qw : veh.qw;
    const vpx = pose ? pose.x : veh.px;
    const vpy = pose ? pose.y : veh.py;
    const vpz = pose ? pose.z : veh.pz;

    // head spring: target displacement opposes the felt force
    const tx = clamp(-t.leanPerMs2 * veh.accX, -t.maxLean, t.maxLean);
    const tz = clamp(-t.leanPerMs2 * veh.accZ, -t.maxLean, t.maxLean);
    const ty = clamp(-t.heavePerMs2 * (veh.accY - GRAVITY), -t.maxLean, t.maxLean);
    const om = 2 * Math.PI * t.headHz;
    const kk = om * om;
    const cc = 2 * t.headZeta * om;
    // semi-implicit integration in a few sub-steps keeps it stable at low frame rates
    const n = dt > 0.012 ? Math.ceil(dt / 0.008) : 1;
    const hs = dt / n;
    for (let i = 0; i < n; i++) {
      this.ovx += (kk * (tx - this.ox) - cc * this.ovx) * hs;
      this.ovy += (kk * (ty - this.oy) - cc * this.ovy) * hs;
      this.ovz += (kk * (tz - this.oz) - cc * this.ovz) * hs;
      this.ox += this.ovx * hs;
      this.oy += this.ovy * hs;
      this.oz += this.ovz * hs;
    }

    // body axes from the pose
    const b = this.b;
    b[0] = 1 - 2 * (qy * qy + qz * qz);
    b[1] = 2 * (qx * qy + qw * qz);
    b[2] = 2 * (qx * qz - qw * qy);
    b[3] = 2 * (qx * qy - qw * qz);
    b[4] = 1 - 2 * (qx * qx + qz * qz);
    b[5] = 2 * (qy * qz + qw * qx);
    b[6] = 2 * (qx * qz + qw * qy);
    b[7] = 2 * (qy * qz - qw * qx);
    b[8] = 1 - 2 * (qx * qx + qy * qy);
    const yaw = Math.atan2(-b[2], b[0]);
    const pitch = Math.asin(clamp(b[1], -1, 1));
    const roll = Math.atan2(-b[7], b[4]);
    if (!this.started) {
      this.pitchS = pitch;
      this.rollS = roll;
      this.started = true;
    }
    const ko = 1 - Math.exp(-dt / t.orientTau);
    this.pitchS += (pitch - this.pitchS) * ko;
    this.rollS += (roll - this.rollS) * ko;
    // yaw rate + = turning left; looking into a left turn means a positive yaw offset
    const ahead = clamp(t.lookAhead * veh.yawRate, -t.lookAheadMax, t.lookAheadMax) * clamp(veh.speed / 8, 0, 1);
    this.aheadS += (ahead - this.aheadS) * (1 - Math.exp(-dt / t.lookAheadTau));

    // position: eye point + head offset, carried rigidly by the body
    const e = this.seat ?? veh.spec.eye;
    const lx = e.x + this.ox;
    const ly = e.y + this.oy;
    const lz = e.z + this.oz;
    this.x = vpx + b[0] * lx + b[3] * ly + b[6] * lz;
    this.y = vpy + b[1] * lx + b[4] * ly + b[7] * lz;
    this.z = vpz + b[2] * lx + b[5] * ly + b[8] * lz;

    // orientation: q = yaw(Y) · pitch(Z) · roll(X)
    const st = this.seat;
    const ya = (yaw + (st ? -st.yaw : this.aheadS) - this.lookYaw) * 0.5;
    const pa = (this.pitchS * t.pitchFollow + (st ? st.pitch : t.basePitch) + this.lookPitch) * 0.5;
    const ra = this.rollS * t.rollFollow * 0.5;
    const sy = Math.sin(ya);
    const cy = Math.cos(ya);
    const sp = Math.sin(pa);
    const cp = Math.cos(pa);
    const sr = Math.sin(ra);
    const cr = Math.cos(ra);
    // yaw ⊗ pitch
    // (0,sy,0,cy) ⊗ (0,0,sp,cp): x = sy*sp, y = sy*cp, z = cy*sp, w = cy*cp
    const px = sy * sp;
    const py = sy * cp;
    const pz = cy * sp;
    const pw = cy * cp;
    // ⊗ roll (sr,0,0,cr)
    this.qx = pw * sr + px * cr;
    this.qy = py * cr + pz * sr;
    this.qz = pz * cr - py * sr;
    this.qw = pw * cr - px * sr;

    this.fov = t.baseFov + t.fovKick * clamp(veh.speed / t.fovSpeed, 0, 1);
  }
}
