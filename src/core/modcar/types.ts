/**
 * ModCar — the modular vehicle (docs/MODCAR.md). Every part fits every vehicle frame that has a mount of
 * its category; what the parts are decides how the vehicle drives. This file is the vocabulary: pure data
 * types, no three, no DOM.
 *
 * Frame model space: on the ground under the middle of the wheelbase, on the centre line;
 * +x forward, +y up, +z right, metres (the body frame of src/core/vehicle/spec.ts, but with the origin on
 * the ground instead of at the centre of gravity — the CG depends on the parts and is derived).
 */

/** what a mount takes and what a part is */
export type Category =
  | 'engine'
  | 'gearbox'
  | 'radiator'
  | 'battery'
  | 'fuelTank'
  | 'exhaust'
  | 'turbo'
  | 'rim'
  | 'tire'
  | 'steering'
  | 'seat'
  | 'door'
  | 'hood'
  | 'trunk'
  | 'bumperFront'
  | 'bumperRear'
  | 'headlight'
  | 'taillight'
  | 'mirror'
  | 'roof'
  | 'armor'
  | 'horn'
  | 'radio'
  | 'handbrake'
  | 'gearLever'
  | 'ignition';

export const CATEGORIES: readonly Category[] = [
  'engine',
  'gearbox',
  'radiator',
  'battery',
  'fuelTank',
  'exhaust',
  'turbo',
  'rim',
  'tire',
  'steering',
  'seat',
  'door',
  'hood',
  'trunk',
  'bumperFront',
  'bumperRear',
  'headlight',
  'taillight',
  'mirror',
  'roof',
  'armor',
  'horn',
  'radio',
  'handbrake',
  'gearLever',
  'ignition',
];

/** categories that sit on another part rather than on the frame: the tyre on a rim, the turbo on an engine */
export const SUB_CATEGORIES: Readonly<Partial<Record<Category, Category>>> = { tire: 'rim', turbo: 'engine' };

/** the panels: their shape belongs to the frame's opening, the part brings only its style */
export const PANEL_CATEGORIES: ReadonlySet<Category> = new Set(['door', 'hood', 'trunk']);

export type FuelType = 'petrol' | 'diesel' | 'mix2t';
export type FrameKind = 'sedan' | 'pickup' | 'moto' | 'rv';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Text {
  zh: string;
  en: string;
}

// ------------------------------------------------------------------ what each kind of part brings

export interface EngineStats {
  /** full-load torque, [rpm, N·m], linearly interpolated (the last point is past the redline, 0 N·m) */
  curve: [number, number][];
  idle: number;
  redline: number;
  /** engine braking torque at the redline (N·m) */
  brakeNm: number;
  fuel: FuelType;
  cooling: 'air' | 'water';
  /** fuel per kWh delivered (game scale, see VehicleSpec.fuel) */
  lPerKWh: number;
  /** fuel burnt idling (L/h, game scale) */
  idleLph: number;
  cylinders: number;
  layout: 'single' | 'twin' | 'inline' | 'flat' | 'v';
  /** oil it holds (L) */
  oilL: number;
  /** heat to carry away at full power, as a share of the power (water-cooled: the radiator's job) */
  heat: number;
  /** air-cooled engines shed this much themselves (kW at speed; less standing still) */
  selfCoolKw?: number;
  /** takes a turbo on its M_turbo */
  turbo: boolean;
  /** the bank of engine sounds (src/game/modcar/engineAudio.ts) */
  sound: string;
}

export interface GearboxStats {
  ratios: number[];
  /** 0 = no reverse gear (motorcycle boxes) */
  reverse: number;
  shiftTime: number;
  efficiency: number;
}

export interface RadiatorStats {
  /** heat it sheds at speed with full coolant (kW) */
  coolKw: number;
  coolantL: number;
}

export interface BatteryStats {
  /** stored energy (kWh): starter, lamps, radio */
  kWh: number;
}

export interface TankStats {
  litres: number;
}

export interface ExhaustStats {
  /** torque multiplier (freer flow) */
  torque: number;
  /** loudness for the sound (1 = stock) */
  loud: number;
}

export interface TurboStats {
  /** torque multiplier once spooled */
  boost: number;
  /** boost builds above this engine speed (rpm) */
  spoolRpm: number;
  /** seconds for boost to follow the throttle */
  lag: number;
}

export interface RimStats {
  /** outer radius of the rim (m): the tyre's inner radius */
  radius: number;
  width: number;
  /** takes a tyre (false: the rubber is part of it, a shopping-trolley wheel) */
  tire: boolean;
  /** grip and rolling resistance multipliers per surface when there is no tyre (or its own rubber) */
  grip: number[];
  rr: number;
  /** two rims side by side (a motorhome's rear) */
  dual?: boolean;
}

export interface TireStats {
  /** sidewall height (m): wheel radius = rim radius + sidewall */
  sidewall: number;
  width: number;
  /** grip multiplier per ground surface (asphalt, gravel, dirt, grass, sand, snow, ice) */
  grip: number[];
  /** rolling resistance multiplier */
  rr: number;
  /** tread worn per 100 km of ordinary driving (0…1) */
  wear: number;
  /** road noise for the sound (1 = a road tyre) */
  noise: number;
}

export interface SteeringStats {
  /** steering-wheel turns per road-wheel angle (the visual wheel) */
  ratio: number;
  /** free play (deg of road-wheel angle) */
  playDeg: number;
  /** multiplier on how fast the road wheels follow the input */
  rate: number;
  /** a handlebar: turns with the fork, no ratio */
  bar?: boolean;
}

export interface SeatStats {
  /** the occupant's eye above the seat's mount point (m) */
  eyeUp: number;
  /** and behind it (m, + = towards the back) */
  eyeBack: number;
  /** 0…1, for the camp and the future comfort system */
  comfort: number;
  swivel?: boolean;
}

export interface PanelStats {
  style: 'stock' | 'rusty' | 'armor' | 'cage' | 'fridge';
  /** how much a hit on this side is softened (0…1) */
  armor: number;
  /** extra drag area when fitted (m²) */
  drag: number;
  /** has glass (a cage or a fridge door has none) */
  window: boolean;
  /** extra cooling for the engine under it (bonnet scoop) */
  cooling?: number;
}

export interface BumperStats {
  /** ramming strength: how little a hit hurts the vehicle (0…1) */
  ram: number;
  drag: number;
  plow?: boolean;
}

export interface LampStats {
  /** brightness relative to a stock headlamp */
  light: number;
  /** reach multiplier of the beam */
  reach: number;
  /** electric load (W) */
  watts: number;
}

export interface MirrorStats {
  size: number;
}

export interface RoofStats {
  drag: number;
  /** solar charging in full sun (W) */
  solarW?: number;
  /** extra lamps (W) */
  lightW?: number;
  ram?: number;
}

export interface ArmorStats {
  armor: number;
  drag: number;
}

export interface HornStats {
  sound: string;
}

export interface RadioStats {
  tape: boolean;
  watts: number;
}

export interface HandbrakeStats {
  /** lock strength (1 = stock; a drift lever locks harder and faster) */
  strength: number;
}

export interface GearLeverStats {
  /** multiplier on the gearbox's shift time */
  shift: number;
}

export interface IgnitionStats {
  kind: 'key' | 'button';
}

export interface PartDef {
  id: string;
  cat: Category;
  name: Text;
  /** kg (dry: fluids are added from the instance) */
  mass: number;
  /** how it is carried: small = one hand, medium = in the hands, large = both arms at a walk */
  carry: 'small' | 'medium' | 'large';
  /** model file under public/models/modcar/ (default parts/<id>) */
  model?: string;
  /** scales to the mount's fit box (bumpers, roof items, armour) */
  stretch?: boolean;
  /** stock:<frame> marks the factory fit of a frame; meme / apoc mark the fun ones */
  tags?: string[];
  /** seconds to fit or remove (default by carry class and, for an engine, weight; never over 1) */
  installS?: number;
  engine?: EngineStats;
  gearbox?: GearboxStats;
  radiator?: RadiatorStats;
  battery?: BatteryStats;
  fuelTank?: TankStats;
  exhaust?: ExhaustStats;
  turbo?: TurboStats;
  rim?: RimStats;
  tire?: TireStats;
  steering?: SteeringStats;
  seat?: SeatStats;
  panel?: PanelStats;
  bumper?: BumperStats;
  lamp?: LampStats;
  mirror?: MirrorStats;
  roof?: RoofStats;
  armor?: ArmorStats;
  horn?: HornStats;
  radio?: RadioStats;
  handbrake?: HandbrakeStats;
  gearLever?: GearLeverStats;
  ignition?: IgnitionStats;
}

// ------------------------------------------------------------------ frames and mounts

export interface MountDef {
  id: string;
  cat: Category;
  /** where the part's origin goes (frame model space) */
  pos: V3;
  /** the part's orientation there (x, y, z, w) */
  quat: [number, number, number, number];
  /** −1 left, +1 right (the part is mirrored), 0 centre */
  side: -1 | 0 | 1;
  label: Text;
  // hubs (cat 'rim')
  axle?: 'front' | 'rear';
  steer?: boolean;
  driven?: boolean;
  handbrake?: boolean;
  // seats
  driver?: boolean;
  /** stretch box [length x, width (across), height] (m) */
  fit?: [number, number, number];
  // panels
  panel?: string;
  hinge?: 'y' | 'z';
  openDeg?: number;
  /** the frame-model object the part on this mount moves with (a motorcycle's FORK); absent = the frame */
  on?: string;
  /** the room the mount leaves its part (mount frame, game axes): under a bonnet, its top is the bonnet's */
  room?: { min: V3; max: V3 };
}

export interface AxleSuspension {
  springHz: number;
  dampingRatio: number;
  bumpScale: number;
  reboundScale: number;
  travel: number;
  antiRollRatio: number;
  slipPeakDeg: number;
}

export interface FrameDef {
  id: string;
  kind: FrameKind;
  name: Text;
  /** the bare frame (shell, chassis, interior, glass) and where its own mass sits */
  mass: number;
  cg: V3;
  /** principal inertias of the bare frame about its own CG (kg·m²) */
  inertia: { roll: number; yaw: number; pitch: number };
  /** the wheel radius the hubs were modelled for: bigger wheels lift the body by the difference */
  hubRadius: number;
  suspension: { front: AxleSuspension; rear: AxleSuspension };
  steering: {
    maxDeg: number;
    ackermann: number;
    rateLow: number;
    rateHigh: number;
    smoothTime: number;
    returnScale: number;
    gripLimitG: number;
    slipMarginDeg: number;
  };
  /** total service-brake force the frame's brakes can put on the road (N): heavier builds stop longer */
  brakeN: number;
  /** share of it on the front axle */
  brakeFront: number;
  /** drag area of the bare shape (m²) */
  cdA: number;
  /** differential ratio */
  finalDrive: number;
  /** contact box for the body (frame model space): ends, sides, underside and top */
  body: { front: number; rear: number; halfWidth: number; bottom: number; top: number };
  /** 0 open … 1 a closed cabin (with every door fitted) */
  enclosed: number;
  /** single-track vehicle (the motorcycle) */
  balance?: boolean;
  chase: { dist: number; height: number; look: number };
  mounts: MountDef[];
  /** how the frame model's moving pieces move (from its mounts JSON; absent for a placeholder) */
  rig?: FrameRig;
  /** mounts the works leave empty (a seat in a pickup's bed is the owner's idea) */
  bare?: string[];
}

/**
 * The frame model's hinges, needles and wipers as its modeller measured them (game frame, metres,
 * degrees; a rotation of `openDeg` / `fullDeg` / `sweepDeg` about `axis`, right hand).
 */
export interface FrameRig {
  /** by object name: P_<mount>, FUEL_CAP */
  panels: Record<string, { axis: [number, number, number]; openDeg: number; glass: string | null; mount: string | null }>;
  /** by object name: N_speed, N_rpm, N_fuel, N_temp — a full reading is `fullDeg` from rest (zero) */
  needles: Record<string, { axis: [number, number, number]; fullDeg: number }>;
  /** by object name: WIPER_L, WIPER_R */
  wipers: Record<string, { axis: [number, number, number]; sweepDeg: number }>;
  /** a motorcycle's steering head: the FORK object turns about it (and what rides on it) */
  fork?: { pivot: [number, number, number]; axis: [number, number, number]; lower?: { object: string; axis: [number, number, number]; travel: number } };
  /** the rear shocks: an upper half on the frame and a lower half on the swingarm, eye to eye */
  shocks?: { upper: string; lower: string; upperEye: [number, number, number]; lowerEye: [number, number, number] }[];
  /** the SWINGARM object swings about its pivot with the rear wheel (length: pivot to the rear hub) */
  swingarm?: { pivot: [number, number, number]; axis: [number, number, number]; length: number };
  /** the side STAND: folded by foldDeg about its axis while ridden */
  stand?: { pivot: [number, number, number]; axis: [number, number, number]; foldDeg: number };
}

// ------------------------------------------------------------------ the things in the world

export interface Fluids {
  /** litres by fuel type in a tank */
  fuel?: Partial<Record<FuelType, number>>;
  /** engine oil (L) */
  oilL?: number;
  /** radiator coolant (L) */
  coolantL?: number;
  /** battery charge 0…1 */
  charge?: number;
}

/** one real part: what it is and the state it is in */
export interface PartInstance {
  uid: string;
  part: string;
  /** condition 0 (wrecked) … 1 (new) */
  cond: number;
  /** palette index of its paint; −1 = its own factory finish */
  paint: number;
  dirt: number;
  rust: number;
  /** caked grime and scale over the dirt (a barn find, a wreck): the scraper's (docs/MODCAR.md §15) */
  crust?: number;
  /** being cleaned: a grime mask is kept for it (grime.ts), what is left texel by texel */
  grime?: boolean;
  fluids: Fluids;
  /** tyres: tread left 0…1, and a puncture */
  tread?: number;
  flat?: boolean;
  /** parts on its sub-mounts: 'tire' on a rim, 'turbo' on an engine */
  sub: Record<string, PartInstance>;
  /** panels: the frame whose opening it was last fitted to (its shape when carried or lying about) */
  shapeOf?: string;
}

/** a vehicle: a frame and what is fitted to it */
export interface Build {
  uid: string;
  frame: string;
  /** the frame's own paint (palette index) and second colour */
  paint: number;
  paint2: number;
  dirt: number;
  rust: number;
  /** caked grime and scale on the body (its windows too): the scraper's */
  crust?: number;
  /** the body is being cleaned: a grime mask is kept for it */
  grime?: boolean;
  cond: number;
  /** mount id → the part on it */
  parts: Record<string, PartInstance>;
  /**
   * What rides in it (cargo.ts): each thing's mass where it sits, frame model space. Not the vehicle's own:
   * the game puts it in from what is stowed, and the derived mass and centre of gravity take it in.
   */
  cargo?: { m: number; x: number; y: number; z: number }[];
}
