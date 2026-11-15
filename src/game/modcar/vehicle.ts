/**
 * One ModCar vehicle in the game: its build and systems, its simulation and its view, and the body as
 * a solid for whoever walks round it. A vehicle nobody drives sleeps (is not simulated) once it has
 * settled, and wakes when a part goes on or comes off, or when someone gets in.
 */
import type { RenderCore } from '../render/core';
import { ModSystems, type ModEnv } from '../../core/modcar/systems';
import type { Build } from '../../core/modcar/types';
import { VehicleSim, type VehicleInput } from '../../core/vehicle/sim';
import type { VehicleSpec } from '../../core/vehicle/spec';
import type { Ground } from '../../core/world/ground';
import { VehicleSolid } from '../../core/onfoot/vehicle';
import { CarView } from './carView';

const IDLE: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

export class ModVehicle {
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
    if (!driven && this.awake <= 0 && !this.sys.running) return;
    const n = this.sim.update(dt, input ?? IDLE, ground);
    this.sys.update(n * this.sim.h, env);
    if (driven || this.sys.running || this.sim.speed > 0.05) this.awake = Math.max(this.awake, 1.5);
    else this.awake -= dt;
  }
}
