/**
 * One ModCar vehicle in the game: its build and systems, its simulation and its view, and the body as
 * a solid for whoever walks round it. A vehicle nobody drives sleeps (is not simulated) once it has
 * settled, and wakes when a part goes on or comes off, or when someone gets in.
 */
import * as THREE from 'three';
import type { RenderCore } from '../render/core';
import { ModSystems, type ModEnv } from '../../core/modcar/systems';
import type { Build } from '../../core/modcar/types';
import { VehicleSim, type VehicleInput } from '../../core/vehicle/sim';
import type { VehicleSpec } from '../../core/vehicle/spec';
import type { Ground } from '../../core/world/ground';
import { VehicleSolid } from '../../core/onfoot/vehicle';
import { CarView } from './carView';
import type { Carrier } from './loose';

const IDLE: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

const DOWN = new THREE.Vector3(0, -1, 0);

/** a mesh one can put a thing on: shown, and no ghost (the hologram of a part to come) */
export function visibleUp(o: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    if (!p.visible || p.name.startsWith('ghost:')) return false;
  }
  return true;
}

/** a vehicle: its systems, its simulation, its view, its body as a solid; things put on it ride with it */
export class ModVehicle implements Carrier {
  readonly sys: ModSystems;
  readonly sim: VehicleSim;
  readonly view: CarView;
  readonly solid: VehicleSolid;
  /** seconds it keeps being simulated with nobody at the wheel */
  awake = 3;
  /** assist: with a driver in, the brakes hold the car once it has stopped */
  assistHold = true;
  /** the radio part is switched on, and the station it is on (radio.ts SONGS) */
  radioOn = false;
  radioSong = 0;
  /** how much further back (m) the chase view stands behind it: what it tows (the tow system's) */
  chaseBack = 0;
  /**
   * The vehicle it rides on (a motorcycle on another's rack: v3/moto-rack, J9e): posed by that system, never its own
   * physics, nobody gets on it; null: on its own wheels
   */
  carriedBy: ModVehicle | null = null;
  /** knocks against solids already heard */
  knocksHeard = 0;
  /** blow-outs already heard (its systems count them) */
  burstsHeard = 0;

  constructor(
    core: RenderCore,
    build: Build,
    x: number,
    groundY: number,
    z: number,
    yaw: number,
    ground?: Ground,
  ) {
    this.sys = new ModSystems(build);
    this.sim = new VehicleSim(this.sys.derived.spec as VehicleSpec);
    // (with the ground, the body box starts clear of it whatever the wheels)
    this.sim.reset(x, groundY, z, yaw, ground);
    this.sim.setParkBrake(true);
    this.sys.bind(this.sim);
    this.view = new CarView(build, this.sys.derived);
    core.scene.add(this.view.root);
    this.solid = new VehicleSolid(this.sim);
    this.origin = core.origin;
  }

  // ------------------------------------------------------------------ things put on it

  private readonly origin: { x: number; y: number; z: number };
  private readonly rayFrom = new THREE.Vector3();

  get frame(): THREE.Object3D {
    return this.view.root;
  }

  /**
   * The highest surface of the vehicle at (x, z) (world) not above `fromY`: its bed's floor, a seat, the
   * roof, the bonnet; a wall or a side it passes (things slide off those). Null where none of it is under
   * the point. One ray straight down over its own shapes (CarView.castShown: about 0.1 ms on a motorhome, where
   * three's ray over every face took 11 — docs/V3/plan/prompts.md §一).
   */
  surfaceAt(x: number, z: number, fromY: number): number | null {
    const s = this.sim;
    if (Math.hypot(x - s.px, z - s.pz) > s.spec.body.halfLength + 0.6) return null;
    const o = this.origin;
    const h = this.view.castShown(this.rayFrom.set(x - o.x, fromY - o.y, z - o.z), DOWN, 5, 0.55);
    return h ? h.point.y + o.y : null;
  }

  get build(): Build {
    return this.sys.build;
  }

  /** a part went on or came off: derive again, redraw, and let it settle on its new wheels */
  changed(): void {
    this.sys.rebuild();
    this.view.refresh(this.sys.derived);
    this.awake = 3;
  }

  /** step the simulation and the systems (input = the driver's, or none) */
  step(dt: number, ground: Ground, env: ModEnv, input: VehicleInput | null): void {
    const driven = input !== null;
    // a driver keeps a car still with the pedal (the assist does it for them); nobody at the wheel, only the handbrake (or P) does
    // (a motorcycle left standing is on its side stand and in gear: it does not roll off)
    this.sim.autoHold = (driven && this.assistHold) || (!driven && !!this.view.frame.balance);
    this.sys.radioOn = this.radioOn;
    // (a trailer: posed behind what tows it, or standing on its jockey wheel — the tow system's, never its own physics;
    // a motorcycle on a rack: posed on it — the rack's)
    if (this.view.frame.towed || this.carriedBy) {
      this.sys.update(dt, env);
      return;
    }
    // (left with its lights or its radio on, it stays awake: they run the battery down)
    if (!driven && this.awake <= 0 && !this.sys.running && !this.radioOn && !this.sys.lightsOn) return;
    const n = this.sim.update(dt, input ?? IDLE, ground);
    this.sys.update(n * this.sim.h, env);
    if (driven || this.sys.running || this.sim.speed > 0.05) this.awake = Math.max(this.awake, 1.5);
    else this.awake -= dt;
  }
}
