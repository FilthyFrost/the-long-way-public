/**
 * The narrow interface between the vehicle systems (parts, condition, tyres, heat, quirks —
 * src/core/vehicle/systems) and the physics (sim.ts). The systems write multipliers and limits here;
 * the simulation only reads them. All defaults are neutral (×1, +0), so a sim without systems behaves
 * exactly as the tuned spec — the handling metrics in specs/driving are measured that way.
 */

/** number of ground surface kinds (src/core/world/ground.ts Surface) */
export const SURFACE_COUNT = 7;

/**
 * What is on a hub (SimMods.wheelFit). Tyre: a normal wheel. Rim: a rim without its tyre — the radius
 * is whatever the axle and radiusOffset give (the rim's own), grip × RIM_GRIP and rolling resistance ×
 * RIM_RR on top of mods.mu / mods.rr, a harsh ride (road feel). None: an empty hub — no wheel at that
 * corner: the corner drops onto the hub (spec.emptyHubRadius, else 0.45 of spec.wheelRadius) and it grinds along the road like a
 * locked wheel with little grip (radiusOffset, drive and brakes do not apply to it); scraping shows in
 * RoadFeel.scrape.
 */
export const WheelFit = { Tyre: 0, Rim: 1, None: 2 } as const;
export type WheelFitId = (typeof WheelFit)[keyof typeof WheelFit];
/** grip of a bare steel rim relative to a tyre (docs/MODCAR.md §4: 抓地 0.35) */
export const RIM_GRIP = 0.35;
/** rolling resistance of a bare rim relative to a tyre (it digs into anything soft) */
export const RIM_RR = 1.8;

export class SimMods {
  /** engine torque multiplier (part tier × condition × limp mode) */
  torque = 1;
  /** highest engine speed allowed, as a fraction of the redline (limp mode lowers it) */
  rpmLimit = 1;
  /** fuel burnt per kWh multiplier (bigger engine burns more) */
  fuel = 1;
  /** engine can run at all (fuel, a part in the slot, not seized); false stops it */
  engineCanRun = true;
  /** service brake force multiplier per wheel (FL, FR, RL, RR): worn brakes, a pulling quirk */
  readonly brake = new Float64Array([1, 1, 1, 1]);
  /** grip multiplier per wheel and surface: index wheel * SURFACE_COUNT + surface (tyre type × tread × flat) */
  readonly mu = new Float64Array(4 * SURFACE_COUNT).fill(1);
  /** rolling-resistance multiplier per wheel and surface (tyre type, a flat) */
  readonly rr = new Float64Array(4 * SURFACE_COUNT).fill(1);
  /** loss of rolling radius per wheel (m): a flat tyre sits the corner down */
  readonly radiusDrop = new Float64Array(4);
  /**
   * Size of each wheel relative to its axle's radius (m, + = bigger): a mismatched wheel. Unlike
   * radiusDrop (a flat: the tyre squashes, the rolling radius stays) this is a real size — the corner
   * rises or sinks, the wheel rolls on the new radius (gearing, wheel speed), and a left/right
   * difference steers the axle towards the smaller wheel. A change is put in force at once without a
   * kick (VehicleSim re-seats the body); it is meant for a part change, not for every frame.
   */
  readonly radiusOffset = new Float64Array(4);
  /** what is on each hub (WheelFit): a tyre, a bare rim or nothing */
  readonly wheelFit = new Uint8Array(4);
  /** free play in the steering (rad of road-wheel angle): the wheel turns before the tyres do */
  steerPlay = 0;
  /** steady pull (rad of road-wheel angle, + = right): a flat, bent track rod */
  steerPull = 0;

  reset(): void {
    this.torque = 1;
    this.rpmLimit = 1;
    this.fuel = 1;
    this.engineCanRun = true;
    this.brake.fill(1);
    this.mu.fill(1);
    this.rr.fill(1);
    this.radiusDrop.fill(0);
    this.radiusOffset.fill(0);
    this.wheelFit.fill(WheelFit.Tyre);
    this.steerPlay = 0;
    this.steerPull = 0;
  }
}

/**
 * What the suspension and tyres did, for the camera, the sound, the dashboard props and the damage
 * model. Updated every physics step by the simulation; read-only for everybody else.
 */
export class RoadFeel {
  /** short envelope (0…1) kicked by a sudden change in a wheel's compression speed: kerbs, joints, potholes */
  thump = 0;
  /** number of thumps since reset (consumers compare with their last count to fire a one-shot) */
  thumps = 0;
  /** strength (compression-speed step, m/s) and wheel of the latest thump */
  lastThump = 0;
  lastThumpWheel = 0;
  /** bump-stop strikes since reset, and the compression speed of the latest (m/s) */
  bottomOuts = 0;
  lastBottomOut = 0;
  /** landings (a wheel touching down after 0.15 s in the air, hard) and the sink speed of the latest (m/s) */
  landings = 0;
  lastLanding = 0;
  sinceLanding = 1;
  /** fewer than two wheels on the ground */
  airborne = false;
  airTime = 0;
  /** smoothed RMS of the wheels' compression speed (m/s): how busy the suspension is (washboard, rough track) */
  suspRms = 0;
  /** surface micro-texture felt through the tyres (0…1; cosmetic — not in the physics) */
  buzz = 0;
  /** body hit the ground: impulse of the latest contact (N·s) and count */
  bodyHits = 0;
  lastBodyHit = 0;
  /** fastest a body point slid along the ground this step (m/s; 0 = none): sparks, the scrape */
  scrape = 0;
  /** fastest a bare rim (WheelFit.Rim) rolled on the ground this step (m/s; 0 = none): the grind */
  rim = 0;

  reset(): void {
    this.thump = 0;
    this.thumps = 0;
    this.lastThump = 0;
    this.lastThumpWheel = 0;
    this.bottomOuts = 0;
    this.lastBottomOut = 0;
    this.landings = 0;
    this.lastLanding = 0;
    this.sinceLanding = 1;
    this.airborne = false;
    this.airTime = 0;
    this.suspRms = 0;
    this.buzz = 0;
    this.bodyHits = 0;
    this.lastBodyHit = 0;
    this.scrape = 0;
    this.rim = 0;
  }
}
