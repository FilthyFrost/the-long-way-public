/**
 * Keeps a vehicle's meshes in step with its simulation: pose, wheels, steering wheel,
 * gauges, and the little pendulum hanging from the mirror.
 */
import * as THREE from 'three';
import { GRAVITY, makePose, type Pose, type VehicleSim } from '../../core/vehicle/sim';
import type { Ground } from '../../core/world/ground';
import { GroundSample } from '../../core/world/ground';
import type { RenderCore } from '../render/core';
import { WIPER_MAX_ANGLE } from '../render/materials';
import { castShadows } from '../render/shadow';
import { globals } from '../render/shaderlib';
import { buildVehicle } from './models';
import { SPEEDO, buildBlobShadow, type VehicleParts } from './truck';

/** the cabin lamp's colour at full strength (linear): a warm bulb */
const LAMP = new THREE.Color(1.0, 0.7, 0.42);

const DEG = Math.PI / 180;

export class VehicleView {
  readonly parts: VehicleParts;
  readonly pose: Pose = makePose();
  readonly shadow: THREE.Mesh;
  /** 0…1 fuel shown on the gauge */
  fuel = 0.72;
  lightsOn = false;
  /** the lamps in the room (closed vehicles) */
  cabinLight = false;
  /** strength of the cabin lamp (linear) */
  lampStrength = 0.62;
  /** where each mover stands, 0 = shut … 1 = open */
  readonly moverState: Record<string, number> = {};
  private cutawayOn = false;
  /** the slots the model comes with installed */
  readonly defaultSlots: Set<string>;
  /** wiper sweep 0…1 (0 = parked) */
  wiperAngle = 0;
  private readonly local = { x: 0, y: 0, z: 0 };
  private readonly gs = new GroundSample();
  // charm pendulum state: swing angles (rad) and rates
  private cx = 0;
  private cz = 0;
  private cvx = 0;
  private cvz = 0;
  private needle = 0;
  private bodyMat: THREE.ShaderMaterial | null = null;
  private readonly basis = new Float64Array(9);

  constructor(
    private readonly core: RenderCore,
    readonly sim: VehicleSim,
  ) {
    this.parts = buildVehicle(sim.spec);
    core.scene.add(this.parts.root);
    // the big solid parts cast shadows (also into the cab); small trim is not worth a draw call each
    const body = this.parts.body ?? (this.parts.root.getObjectByName('body') as THREE.Mesh | undefined);
    for (const c of this.parts.casters ?? (body ? [body] : [])) castShadows(c, true);
    if (body) this.bodyMat = body.material as THREE.ShaderMaterial;
    for (const w of this.parts.wheels) castShadows(w.spin, true);
    castShadows(this.parts.steeringWheel, true);
    for (const k of Object.keys(this.parts.movers)) this.moverState[k] = 0;
    this.defaultSlots = new Set(this.parts.slots.filter((sl) => sl.installed).map((sl) => sl.id));
    const fp = this.parts.footprint;
    this.shadow = buildBlobShadow(fp.length, fp.width);
    core.scene.add(this.shadow);
  }

  /** open or shut one of the vehicle's movers (door, awning, …); unknown names are ignored */
  setMover(name: string, t: number): boolean {
    const m = this.parts.movers[name];
    if (!m) return false;
    const v = Math.min(1, Math.max(0, t));
    this.moverState[name] = v;
    m.set(v);
    return true;
  }

  /** hide the right wall, the roof and what stands on it, to look into the room */
  setCutaway(on: boolean): void {
    this.cutawayOn = on;
    if (this.parts.cut) this.parts.cut.visible = !on;
    this.parts.slotMesh?.setCutaway(on);
  }

  get cutaway(): boolean {
    return this.cutawayOn;
  }

  /** 'all', 'none', 'default' or a list of slot ids to install */
  setSlots(mode: 'all' | 'none' | 'default' | string[]): void {
    const sm = this.parts.slotMesh;
    if (!sm) return;
    const ids = mode === 'all' ? sm.slots.map((s) => s.id) : mode === 'none' ? [] : mode === 'default' ? [...this.defaultSlots] : mode;
    sm.setInstalled(ids);
  }

  update(dt: number, ground: Ground, alpha?: number): void {
    const sim = this.sim;
    const p = this.parts;
    sim.renderPose(this.pose, alpha);
    const pose = this.pose;
    this.core.place(p.root, pose.x, pose.y, pose.z);
    p.root.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);

    for (let i = 0; i < 4; i++) {
      const w = sim.wheels[i];
      sim.wheelLocal(i, this.local);
      const node = p.wheels[i];
      node.pivot.position.set(this.local.x, this.local.y, this.local.z);
      node.pivot.rotation.y = -w.steer;
      node.spin.rotation.z = -w.spin;
    }

    p.steeringWheel.rotation.z = -sim.steerAngle * sim.spec.steering.ratio;

    // speedometer needle with a touch of lag, like a cable-driven gauge
    const kmh = Math.min(sim.kmh, SPEEDO.maxKmh + 8);
    this.needle += (kmh - this.needle) * Math.min(1, dt * 9);
    const deg = SPEEDO.minDeg + ((SPEEDO.maxDeg - SPEEDO.minDeg) * this.needle) / SPEEDO.maxKmh;
    p.speedNeedle.rotation.z = -deg * DEG;
    p.fuelNeedle.rotation.z = -(-60 + 120 * this.fuel) * DEG;

    // charm: a damped pendulum driven by what the cab feels
    if (dt > 0) {
      const L = 0.11;
      const steps = Math.max(1, Math.ceil(dt / 0.008));
      const h = Math.min(dt, 0.05) / steps;
      for (let s = 0; s < steps; s++) {
        // equilibrium hangs along −(felt force); small-angle pendulum about z (fore-aft) and x (sideways)
        const az = (-sim.accX / L) * Math.cos(this.cz) - (Math.max(2, sim.accY) / L) * Math.sin(this.cz) - 1.6 * this.cvz;
        const ax = (sim.accZ / L) * Math.cos(this.cx) - (Math.max(2, sim.accY) / L) * Math.sin(this.cx) - 1.6 * this.cvx;
        this.cvz += az * h;
        this.cvx += ax * h;
        this.cz += this.cvz * h;
        this.cx += this.cvx * h;
      }
      this.cz = THREE.MathUtils.clamp(this.cz, -1.1, 1.1);
      this.cx = THREE.MathUtils.clamp(this.cx, -1.1, 1.1);
    }
    p.charm.rotation.set(this.cx, 0, this.cz);

    for (const wp of p.wipers) wp.rotation.z = this.wiperAngle * WIPER_MAX_ANGLE;

    // headlight beam for every lit surface: lamp between the two headlights, aimed a little down
    {
      const b = this.basis;
      sim.basis(b);
      const o = this.core.origin;
      const bx = p.beam.x;
      const by = p.beam.y;
      globals.uHeadPos.value.set(pose.x + b[0] * bx + b[3] * by - o.x, pose.y + b[1] * bx + b[4] * by - o.y, pose.z + b[2] * bx + b[5] * by - o.z);
      globals.uHeadDir.value.set(b[0] - b[3] * 0.1, b[1] - b[4] * 0.1, b[2] - b[5] * 0.1).normalize();
      if (this.lightsOn) globals.uHeadColor.value.setRGB(1.0, 0.82, 0.55).multiplyScalar(2.4);
      else globals.uHeadColor.value.setRGB(0, 0, 0);
    }

    // lights
    const brake = sim.brake > 0.05 || sim.hold ? 1 : 0;
    p.taillights.uniforms.uEmissive.value.setRGB(1.0, 0.16, 0.08).multiplyScalar((this.lightsOn ? 0.5 : 0) + brake * 1.3);
    p.headlights.uniforms.uEmissive.value.setRGB(1.0, 0.86, 0.6).multiplyScalar(this.lightsOn ? 2.2 : 0);
    // instrument lighting: a low warm glow, never brighter than the road ahead
    p.dialGlow.uniforms.uMapEmissive.value = this.lightsOn ? 0.2 : 0.0;
    p.dialGlow.uniforms.uColor.value.setRGB(1, this.lightsOn ? 0.86 : 1, this.lightsOn ? 0.66 : 1);
    if (this.bodyMat) this.bodyMat.uniforms.uEmissive.value.setRGB(0.016, 0.013, 0.01).multiplyScalar(this.lightsOn ? 1 : 0);

    // the cabin lamp: the room gets all of it, the cab in front of the curtain a share (little when drawn)
    const lamp = this.cabinLight && p.enclosed > 0 ? this.lampStrength : 0;
    globals.uCabinLamp.value.copy(LAMP).multiplyScalar(lamp);
    const curtain = this.moverState.curtain ?? 0;
    for (const m of p.cabMaterials ?? []) m.uniforms.uCabinLamp.value.copy(LAMP).multiplyScalar(lamp * 0.42 * (1 - 0.88 * curtain));
    if (p.cabinLamps) p.cabinLamps.uniforms.uEmissive.value.setRGB(1.0, 0.82, 0.55).multiplyScalar(lamp > 0 ? 0.75 : 0);

    // blob shadow on the ground under the body
    ground.sample(pose.x, pose.z, this.gs);
    // pushed a little away from the sun, like a short midday shadow
    const sd = globals.uSunDir.value;
    this.core.place(this.shadow, pose.x - sd.x * 0.45, this.gs.h + 0.03, pose.z - sd.z * 0.45);
    this.shadow.rotation.y = sim.yaw;
    this.shadow.visible = this.parts.root.visible && (!this.core.shadows || globals.uShadowParams.value.x < 0.5);
    this.core.shadowFocus.copy(p.root.position);
    const lift = Math.max(0, pose.y - this.gs.h - sim.spec.cgHeight);
    (this.shadow.material as THREE.ShaderMaterial).uniforms.uStrength.value = 0.42 / (1 + lift * 2.5);
  }

  /** gravity constant re-exported for callers that only know the view */
  static readonly G = GRAVITY;
}
