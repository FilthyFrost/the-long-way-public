/**
 * Vehicle description. Everything a designer tunes lives here; the simulation derives
 * spring rates, hard points and brake forces from these intuitive numbers.
 *
 * Body frame: +x forward, +y up, +z right. Origin = centre of gravity.
 */
export interface AxleSpec {
  /** distance between left and right wheel centres (m) */
  track: number;
  /** undamped ride frequency of this axle's corners (Hz) — sets the spring rate */
  springHz: number;
  /** damping ratio (fraction of critical) */
  dampingRatio: number;
  /** damper multiplier in compression */
  bumpScale: number;
  /** damper multiplier in extension */
  reboundScale: number;
  /** total suspension travel, full droop → full bump (m) */
  travel: number;
  /**
   * Share of the travel used up at rest (0…1). Soft springs need it: a 1.15 Hz spring sags 19 cm under
   * its own load, more than most travels, so the spring is preloaded to sit at this point instead.
   * Omitted = no preload (the spring's natural sag).
   */
  sag?: number;
  /** anti-roll bar rate as a multiple of the wheel rate */
  antiRollRatio: number;
  /** grip multiplier for this axle */
  muScale: number;
  /** slip angle of peak lateral force (deg) — larger = softer, lazier axle */
  slipPeakDeg: number;
  /** share of the service brake on this axle (front + rear = 1) */
  brakeShare: number;
  steerable: boolean;
  driven: boolean;
  handbrake: boolean;
  /**
   * Radius of the wheels fitted on this axle (m); omitted = `spec.wheelRadius`. The hard points and
   * `cgHeight` describe the vehicle standing on wheels of `spec.wheelRadius`: a bigger radius here
   * lifts this axle's corners by the difference (the body pitches), and the rolling radius — wheel
   * speed, gearing, top speed — follows it (docs/MODCAR.md §4, 物理实现说明).
   */
  wheelRadius?: number;
  /**
   * Static compression (m) of this axle at the ride `cgHeight` describes — the hub mounts are body
   * geometry placed for it. Omitted = this axle's own static compression, so the body always rests at
   * cgHeight. A rescaled axle (rescale.ts) keeps its frame's value: a heavier build compresses the
   * springs further and the body sinks by the difference, a lighter one rides higher.
   */
  rideComp?: number;
  /**
   * Load one tyre of this axle is rated at (N): its grip is nominal there and falls by tire.loadSens
   * per 100 % more (a lighter load gains a little). Omitted = each wheel's own static load, so the
   * static weight never changes the grip. Given the frame's design load (rescale.ts fills it in), a
   * heavier engine makes the nose push and an overloaded build slides sooner.
   */
  tyreLoad?: number;
}

/**
 * Single-track vehicle (a motorcycle): both axles have track 0 and the simulation balances it.
 * Each wheel is split into a pair of contact rays a little apart (a stance, so it stands at rest),
 * the rider keeps the body upright and takes the cornering roll moment by leaning; the lean is a
 * visual angle (`VehicleSim.lean`) — the physics body stays upright. Every field has a default.
 */
export interface BalanceSpec {
  /** distance between the two contact rays of each wheel (m); default 0.3 */
  stance?: number;
  /** largest lean angle the rider takes (deg); default 52 */
  maxLeanDeg?: number;
  /** time the visual lean takes to follow the corner (s); default 0.12 */
  leanTime?: number;
  /** how firmly the rider holds the bike upright, 0…1.5; default 1. Past about 60° of roll it lets go (a fall) */
  assist?: number;
}

/**
 * Parts a build lacks (docs/MODCAR.md §3). Each `true` removes that function from the physics;
 * the matching spec fields may hold any placeholder (`NO_ENGINE`).
 */
export interface AbsentParts {
  /** no engine: no torque, never runs, 0 rpm (no starter either), no fuel burnt, no engine braking */
  engine?: boolean;
  /** no gearbox: whatever the selector says the engine revs freely as in N, nothing drives, no park lock */
  gearbox?: boolean;
  /** no steering: the road wheels stay straight (pulls from the tyres still act) */
  steering?: boolean;
  /** no handbrake: the handbrake input and the lever latch do nothing */
  handbrake?: boolean;
}

export interface VehicleSpec {
  id: string;
  label: string;
  /** total mass including occupants and typical cargo (kg) */
  mass: number;
  wheelbase: number;
  /** static fraction of weight on the front axle */
  weightFront: number;
  /** CG height above ground at static ride (m), standing on wheels of `wheelRadius` */
  cgHeight: number;
  /** wheel radius (m); the reference the hard points and `cgHeight` are given for (an axle may fit others) */
  wheelRadius: number;
  /** principal inertias (kg·m²): roll about x, yaw about y, pitch about z */
  inertia: { roll: number; yaw: number; pitch: number };
  front: AxleSpec;
  rear: AxleSpec;
  tire: {
    muLat: number;
    muLong: number;
    /** sliding friction as a fraction of peak */
    slideRatio: number;
    /** grip lost per 100% extra load (load sensitivity) */
    loadSens: number;
    /** relaxation length (m): how far the tyre rolls before lateral force builds */
    relaxLen: number;
    /** minimum share of lateral grip kept at full longitudinal demand (forgiveness) */
    minLatUnderLong: number;
  };
  engine: {
    /** [rpm, N·m] points, linearly interpolated */
    curve: [number, number][];
    idle: number;
    /** clutch/converter stall speed at full throttle (rpm) */
    stall: number;
    redline: number;
    /** engine braking torque at redline (N·m) */
    brakeNm: number;
  };
  gearbox: {
    ratios: number[];
    reverse: number;
    final: number;
    efficiency: number;
    /** upshift rpm at [light, full] throttle */
    upRpm: [number, number];
    /** downshift rpm at [light, full] throttle */
    downRpm: [number, number];
    /** torque interruption during a shift (s) */
    shiftTime: number;
  };
  brakes: { maxG: number };
  aero: { cdA: number };
  steering: {
    /** maximum road-wheel angle at parking speed (deg) */
    maxDeg: number;
    /** steering wheel turns per road-wheel angle (for the visual wheel) */
    ratio: number;
    /** road-wheel slew rate at low / high speed (rad/s) */
    rateLow: number;
    rateHigh: number;
    /** low-pass time constant on the steering input (s) */
    smoothTime: number;
    /** multiplier on the rate when returning to centre */
    returnScale: number;
    /** 0 = parallel steer, 1 = full Ackermann */
    ackermann: number;
    /** full input asks for about this lateral acceleration (g) at speed */
    gripLimitG: number;
    /** extra angle on top of the kinematic angle so the tyres can reach peak slip (deg) */
    slipMarginDeg: number;
  };
  /** contact box used when the body itself touches the ground (rollovers, bottoming) */
  body: { halfLength: number; halfWidth: number; bottom: number; top: number; centerX: number };
  /** driver eye point in the body frame */
  eye: { x: number; y: number; z: number };
  /**
   * Fuel (game scale: the world is compressed about five to one, so consumption is five times a real
   * vehicle's and a tank lasts a few stages of the journey, docs/DESIGN_V2.md §5.6).
   * Burn = idleLph at rest + lPerKWh for every kWh the engine delivers.
   */
  fuel?: { tankL: number; lPerKWh: number; idleLph: number };
  /** single-track vehicle: the simulation balances and leans it (front.track and rear.track are 0) */
  balance?: BalanceSpec;
  /** parts the build lacks */
  absent?: AbsentParts;
  /**
   * How far an empty hub's lowest point — brake drum, stub axle — is from the hub centre (m): the
   * radius an empty hub (SimMods.wheelFit None) grinds on. Default 0.45 × wheelRadius; give it when
   * wheelRadius follows the fitted wheels rather than the frame.
   */
  emptyHubRadius?: number;
}

/** placeholder engine for a build without one (`absent.engine`): no torque anywhere */
export const NO_ENGINE: VehicleSpec['engine'] = {
  curve: [
    [0, 0],
    [1000, 0],
  ],
  idle: 800,
  stall: 1200,
  redline: 6000,
  brakeNm: 0,
};

/**
 * True if the spec uses any of the ModCar physics extensions. Without them the simulation runs the
 * legacy code paths exactly (the four tuned vehicles: harness/sim/modcar_legacy.test.ts).
 */
export function usesExtensions(spec: VehicleSpec): boolean {
  const f = spec.front;
  const r = spec.rear;
  return (
    f.wheelRadius !== undefined ||
    r.wheelRadius !== undefined ||
    f.rideComp !== undefined ||
    r.rideComp !== undefined ||
    f.tyreLoad !== undefined ||
    r.tyreLoad !== undefined ||
    spec.balance !== undefined ||
    spec.absent !== undefined ||
    spec.emptyHubRadius !== undefined
  );
}

/**
 * T0 — the starting vehicle: a small open-top utility truck everyone shares.
 * Slow, light, a little bouncy; honest handling with gentle understeer.
 */
export const T0_TRUCK: VehicleSpec = {
  id: 't0_truck',
  label: '敞篷小货车',
  mass: 900,
  wheelbase: 1.95,
  weightFront: 0.52,
  cgHeight: 0.58,
  wheelRadius: 0.27,
  inertia: { roll: 270, yaw: 880, pitch: 820 },
  front: {
    track: 1.22,
    springHz: 1.45,
    dampingRatio: 0.34,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.21,
    antiRollRatio: 0.6,
    muScale: 0.97,
    slipPeakDeg: 10.3,
    brakeShare: 0.72,
    steerable: true,
    driven: false,
    handbrake: false,
  },
  rear: {
    track: 1.2,
    springHz: 1.6,
    dampingRatio: 0.34,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.2,
    antiRollRatio: 0.32,
    muScale: 1.0,
    slipPeakDeg: 8.8,
    brakeShare: 0.28,
    steerable: false,
    driven: true,
    handbrake: true,
  },
  tire: { muLat: 0.86, muLong: 0.92, slideRatio: 0.85, loadSens: 0.12, relaxLen: 0.5, minLatUnderLong: 0.3 },
  engine: {
    curve: [
      [800, 35],
      [1500, 43],
      [2500, 47.5],
      [3200, 48.5],
      [4200, 46.5],
      [5200, 41],
      [6000, 33.5],
      [6300, 0],
    ],
    idle: 850,
    stall: 2300,
    redline: 6000,
    brakeNm: 12,
  },
  gearbox: {
    ratios: [3.8, 2.2, 1.45, 1.0],
    reverse: 3.9,
    final: 6.5,
    efficiency: 0.87,
    upRpm: [2800, 5600],
    downRpm: [1300, 2600],
    shiftTime: 0.32,
  },
  brakes: { maxG: 0.78 },
  aero: { cdA: 1.1 },
  steering: {
    maxDeg: 35,
    ratio: 17,
    rateLow: 1.9,
    rateHigh: 0.7,
    smoothTime: 0.095,
    returnScale: 1.6,
    ackermann: 0.8,
    gripLimitG: 0.7,
    slipMarginDeg: 6,
  },
  body: { halfLength: 1.6, halfWidth: 0.68, bottom: -0.36, top: 0.98, centerX: 0.05 },
  eye: { x: 0.52, y: 0.84, z: -0.31 },
  fuel: { tankL: 15, lPerKWh: 1.65, idleLph: 2.5 },
};

/**
 * T1 — the van: a cab-over microbus, the first vehicle with a roof and a room behind the seats.
 * Soft and floaty, tall, slow to turn in; it leans, it takes its time, and it is at ease at 80.
 */
export const T1_VAN: VehicleSpec = {
  id: 't1_van',
  label: '面包车',
  mass: 1500,
  wheelbase: 2.4,
  weightFront: 0.46,
  cgHeight: 0.7,
  wheelRadius: 0.32,
  inertia: { roll: 640, yaw: 2600, pitch: 2500 },
  front: {
    track: 1.38,
    springHz: 1.2,
    dampingRatio: 0.3,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.2,
    sag: 0.55,
    antiRollRatio: 0.85,
    muScale: 0.97,
    slipPeakDeg: 10.5,
    brakeShare: 0.62,
    steerable: true,
    driven: false,
    handbrake: false,
  },
  rear: {
    track: 1.36,
    springHz: 1.3,
    dampingRatio: 0.3,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.2,
    sag: 0.55,
    antiRollRatio: 0.45,
    muScale: 1.0,
    slipPeakDeg: 9.0,
    brakeShare: 0.38,
    steerable: false,
    driven: true,
    handbrake: true,
  },
  tire: { muLat: 0.82, muLong: 0.88, slideRatio: 0.85, loadSens: 0.14, relaxLen: 0.6, minLatUnderLong: 0.3 },
  engine: {
    curve: [
      [800, 72.5],
      [1500, 85.6],
      [2400, 93],
      [3000, 93.9],
      [3800, 89.3],
      [4400, 80],
      [5000, 65.1],
      [5300, 0],
    ],
    idle: 850,
    stall: 2000,
    redline: 5000,
    brakeNm: 25,
  },
  gearbox: {
    ratios: [3.8, 2.06, 1.26, 0.89],
    reverse: 3.6,
    final: 5.375,
    efficiency: 0.87,
    upRpm: [2400, 4600],
    downRpm: [1200, 2300],
    shiftTime: 0.4,
  },
  brakes: { maxG: 0.74 },
  aero: { cdA: 2.0 },
  steering: {
    maxDeg: 36,
    ratio: 19,
    rateLow: 1.6,
    rateHigh: 0.6,
    smoothTime: 0.11,
    returnScale: 1.6,
    ackermann: 0.8,
    gripLimitG: 0.62,
    slipMarginDeg: 6,
  },
  body: { halfLength: 2.2, halfWidth: 0.85, bottom: -0.42, top: 1.25, centerX: 0.0 },
  eye: { x: 1.1, y: 0.82, z: -0.42 },
  fuel: { tankL: 40, lPerKWh: 1.65, idleLph: 4 },
};

/**
 * T2 — the off-roader: a short, square 4×4. Torque low down, long suspension travel, all four wheels
 * driven: it goes where the others cannot, climbs loose slopes, and tows.
 */
export const T2_OFFROAD: VehicleSpec = {
  id: 't2_offroad',
  label: '越野车',
  mass: 1750,
  wheelbase: 2.5,
  weightFront: 0.53,
  cgHeight: 0.74,
  wheelRadius: 0.37,
  inertia: { roll: 760, yaw: 3000, pitch: 2900 },
  front: {
    track: 1.46,
    springHz: 1.3,
    dampingRatio: 0.36,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.26,
    sag: 0.55,
    antiRollRatio: 0.7,
    muScale: 0.98,
    slipPeakDeg: 10.5,
    brakeShare: 0.66,
    steerable: true,
    driven: true,
    handbrake: false,
  },
  rear: {
    track: 1.44,
    springHz: 1.4,
    dampingRatio: 0.36,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.27,
    sag: 0.55,
    antiRollRatio: 0.35,
    muScale: 1.0,
    slipPeakDeg: 9.5,
    brakeShare: 0.34,
    steerable: false,
    driven: true,
    handbrake: true,
  },
  tire: { muLat: 0.84, muLong: 0.9, slideRatio: 0.85, loadSens: 0.12, relaxLen: 0.7, minLatUnderLong: 0.3 },
  engine: {
    curve: [
      [700, 112.8],
      [1200, 155.1],
      [1800, 174.8],
      [2400, 176.7],
      [3000, 165.4],
      [3600, 142.9],
      [4200, 112.8],
      [4500, 0],
    ],
    idle: 750,
    stall: 1600,
    redline: 4200,
    brakeNm: 45,
  },
  gearbox: {
    ratios: [4.9, 2.5, 1.45, 1.0, 0.78],
    reverse: 4.2,
    final: 4.3,
    efficiency: 0.84,
    upRpm: [1900, 3700],
    downRpm: [1100, 2000],
    shiftTime: 0.35,
  },
  brakes: { maxG: 0.8 },
  aero: { cdA: 1.62 },
  steering: {
    maxDeg: 35,
    ratio: 18,
    rateLow: 1.8,
    rateHigh: 0.65,
    smoothTime: 0.1,
    returnScale: 1.6,
    ackermann: 0.8,
    gripLimitG: 0.68,
    slipMarginDeg: 6,
  },
  body: { halfLength: 2.1, halfWidth: 0.86, bottom: -0.46, top: 1.1, centerX: 0.0 },
  eye: { x: 0.25, y: 0.68, z: -0.36 },
  fuel: { tankL: 70, lPerKWh: 1.3, idleLph: 4.5 },
};

/**
 * T3 — the motorhome: a house on a truck chassis. Heavy, tall and unhurried; it wallows in bends,
 * needs room to stop, and is the calmest place in the world at 70 km/h.
 */
export const T3_RV: VehicleSpec = {
  id: 't3_rv',
  label: '房车',
  mass: 3800,
  wheelbase: 3.7,
  weightFront: 0.42,
  cgHeight: 1.0,
  wheelRadius: 0.38,
  inertia: { roll: 3000, yaw: 14000, pitch: 13500 },
  front: {
    track: 1.75,
    springHz: 1.15,
    dampingRatio: 0.3,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.2,
    sag: 0.55,
    antiRollRatio: 0.5,
    muScale: 0.99,
    slipPeakDeg: 11,
    brakeShare: 0.5,
    steerable: true,
    driven: false,
    handbrake: false,
  },
  rear: {
    track: 1.7,
    springHz: 1.3,
    dampingRatio: 0.32,
    bumpScale: 0.7,
    reboundScale: 1.3,
    travel: 0.2,
    sag: 0.55,
    antiRollRatio: 0.3,
    muScale: 1.02,
    slipPeakDeg: 9,
    brakeShare: 0.5,
    steerable: false,
    driven: true,
    handbrake: true,
  },
  tire: { muLat: 0.72, muLong: 0.82, slideRatio: 0.85, loadSens: 0.16, relaxLen: 0.9, minLatUnderLong: 0.3 },
  engine: {
    curve: [
      [700, 167.2],
      [1200, 224.4],
      [1600, 248.2],
      [2400, 251.7],
      [3000, 227],
      [3500, 189.2],
      [3900, 145.2],
      [4200, 0],
    ],
    idle: 700,
    stall: 1500,
    redline: 3900,
    brakeNm: 70,
  },
  gearbox: {
    ratios: [4.7, 2.6, 1.5, 1.0, 0.75],
    reverse: 4.4,
    final: 4.1,
    efficiency: 0.85,
    upRpm: [1800, 3400],
    downRpm: [1050, 1900],
    shiftTime: 0.5,
  },
  brakes: { maxG: 0.58 },
  aero: { cdA: 4.15 },
  steering: {
    maxDeg: 38,
    ratio: 22,
    rateLow: 1.3,
    rateHigh: 0.5,
    smoothTime: 0.14,
    returnScale: 1.5,
    ackermann: 0.8,
    gripLimitG: 0.5,
    slipMarginDeg: 6,
  },
  body: { halfLength: 3.3, halfWidth: 1.1, bottom: -0.6, top: 1.9, centerX: 0.3 },
  eye: { x: 1.9, y: 0.85, z: -0.5 },
  fuel: { tankL: 100, lPerKWh: 1.3, idleLph: 6 },
};

export const VEHICLES: Record<string, VehicleSpec> = {
  [T0_TRUCK.id]: T0_TRUCK,
  [T1_VAN.id]: T1_VAN,
  [T2_OFFROAD.id]: T2_OFFROAD,
  [T3_RV.id]: T3_RV,
};
