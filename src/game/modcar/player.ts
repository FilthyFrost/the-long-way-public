/**
 * The player in ModCar (docs/MODCAR.md §5): walking round the workshop with two hands' worth of things (the
 * hotbar's two slots, 1 and 2), picking things up, holding a part up to a vehicle (every mount that takes it
 * shows a ghost; the one under the mark gets the card of the vehicle with it), fitting and swapping with the
 * button held, taking parts off with the other button held, pouring fuel, water and oil — the can lines up
 * with an open filler by itself, the button held pours, the other draws it back out, and one stands still
 * while it flows — spraying and washing, opening doors and getting in.
 *
 * Keys: E or the left button = use (press) / fit, pour, spray (hold); the right button or F held = take
 * off (with a can: draw back out); G held = put down; 1 / 2 (or the wheel) = the other slot; I = the cards.
 *
 * With a sponge, a scraper or a wire brush the left button held on a part (or the body) scrubs it (docs/MODCAR.md
 * §15): the view holds still and the mouse moves the tool over the surface, as a finger on a screen, every
 * stroke taking a band of dirt off where it goes (grime.ts); E still opens doors and lids.
 *
 * With a spray can (Arctic Drive's, §16): the button held on the body, a door, a lid, a bumper or a mirror
 * paints it, its colour going over to the can's while the can empties (paint.ts); aimed at one, the buttons
 * do nothing else (no door opens under the nozzle).
 *
 * Things that stack, hold things or go off (the V3 item model, docs/V3/nodes/N0-items-hands.md): a thing
 * taken up goes onto the stacks of its sort in the slots, then into a thing in a slot that holds its sort, then
 * into a free slot (receive, roomFor; the player's own pick-up is the same, and what does not go in stays
 * lying there); eating takes one off a stack; what is in the hands is looked at every frame, so a thing that
 * has turned is what it turned into before its card is drawn or it is eaten.
 */
import { frameVariant } from './assets';
import * as THREE from 'three';
import { fitPart, fitSub, mountsFor, removePart, removeSub, subMountsOf } from '../../core/modcar/build';
import { installSeconds, partDef, TYRE_SWAP_S } from '../../core/modcar/parts';
import { CAN_NOZZLES, DEFAULT_NOZZLE, nozzleOf, SPRAY_TIERS, sprayLeft, sprayTier, type SprayResult } from '../../core/modcar/paint';
import { paintHex } from '../../core/modcar/palette';
import { compare, perfWith, quickPerf } from '../../core/modcar/stats';
import { canStack, countOf, itemDef, itemMass, mergeStacks, putInside, roomInside, setFreshRate, settleItem, splitStack, stackMax, stampFresh, itemVeil, type DrinkLiquid, type ItemDef, type ItemInstance, type WearSlot } from '../../core/modcar/items';
import { cleanerOf, liquidOf, pour, pourTank, siphon, siphonTank, siphonUse, tankLitres, tankUse, TOOL_INFO, toolName, toolUse, wearCleaner, type Cleaner, type FuelTank, type LiquidKind, type Tool } from '../../core/modcar/tools';
import type { MountDef, PartInstance, FuelType } from '../../core/modcar/types';
import { FootWalker, ND_FOOT, type FootInput } from '../../core/onfoot/walker';
import type { Land } from '../../core/onfoot/land';
import { Push, pushOut, SolidSet, type SolidSource } from '../../core/world/solids';
import { GhostLayer, type GhostSpec } from './ghosts';
import type { Action, SlotView, TransferView } from './hudItems';
import { boxFullness, deviceCard, drinkTone, fitCard, FUEL_ZH, hexCss, itemCardKept, itemLabel, itemLabelPlain, partCard, toolCard, vehicleCard, type ItemCard, type Tone } from './itemInfo';
import { itemNow } from './itemTime';
import { DROP_BLOCKED, type Loose, type LooseThings } from './loose';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';
import type { GarageDevice } from './garageStub';
import type { InteractSources } from './kernel/interact';
import { heldCall, heldUseOf, type HeldLook, type HeldUse } from './kernel/heldUse';
import type { CargoBay, StowAim } from './cargo';
import { LIDLESS_WHY, zoneLidless, zonesFor, type CargoZone } from '../../core/modcar/cargo';
import { passengerSeat, seatMount } from './cockpit';
import { aboardOf, type BoardDoor } from '../../core/modcar/aboard';
import { gateRightActions, ND_HOLD_S } from './arbiter';
import type { OutlineTarget } from '../render/frame';

export type Held = { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | { kind: 'item'; item: ItemInstance } | null;

/**
 * A system's own way with a thing in the hands (docs/ND/PLAN.md: the camera raised to the eye and its shutter, the
 * grinder run): while one claims what is in the hands it is asked first about the use button, the wheel and F (the
 * right button), and its lines go down the right in place of the thing's own. E on a door or a thing stays the game's
 * unless the system takes it.
 */
export interface HandsUse {
  readonly id: string;
  /** whether it takes the buttons with this in the hands */
  claims(held: NonNullable<Held>): boolean;
  /** the use button went down (the left button: 'mouse'; a pad's use button: 'key'); true: taken, the game does nothing with it */
  press?(held: NonNullable<Held>, from: 'key' | 'mouse'): boolean;
  /** …and up again; true: taken */
  release?(held: NonNullable<Held>, from: 'key' | 'mouse'): boolean;
  /** the wheel turned; true: taken (the hotbar stays) */
  wheel?(held: NonNullable<Held>, delta: number): boolean;
  /** E (held secondary) is its own: the game neither eats, drinks nor wears with it */
  takesF?(held: NonNullable<Held>): boolean;
  /** RMB is its own (placement free rotate, camera viewfinder, holding a print up): suppresses camera eye zoom */
  takesRmb?(held: NonNullable<Held>): boolean;
  /** with this in the hands the mark reaches a vehicle's fitted parts (a mending kit: what it mends is one) */
  aimsParts?(held: NonNullable<Held>): boolean;
  /** every frame on foot with it in the hands: E (secondary) and optional RMB held or not */
  step?(held: NonNullable<Held>, dt: number, e: boolean, rmb?: boolean): void;
  /** its lines down the right (absent: the thing's own) */
  words?(held: NonNullable<Held>): Action[];
  /**
   * What it makes of what the mark is on, when the press there is its own (a mending kit on what it mends, a print on
   * where it would stick): these words stand under the mark in place of the thing's own, so that the middle and the
   * right say the same. Null: the mark's own words (the press is the game's).
   */
  aims?(held: NonNullable<Held>): Action[] | null;
  /** how far its own hold has come (0 … 1: a kit's mending), drawn as the ring round the mark; below 0 or absent: none */
  ring?(held: NonNullable<Held>): number;
  /** the thing left the hands (put down, put away, swapped): whatever it was doing stops */
  gone?(held: NonNullable<Held>): void;
}

/**
 * A thing that holds water — a bottle of water, a water can, a mug — seen as the radiator's own bottle: its water
 * goes into a radiator as that bottle's does (docs/V3/plan/finish.md §四.2: no radiator stays dry for want of the
 * right bottle). One for each thing, its litres the thing's own; null for what holds no water.
 */
const WATER_CANS = new WeakMap<ItemInstance, Tool>();
export function waterCanOf(item: ItemInstance): Tool | null {
  const d = itemDef(item.item).drink;
  if (!d || (item.state?.liquid ?? d.liquid) !== 'water') return null;
  let t = WATER_CANS.get(item);
  if (!t) {
    t = { uid: item.uid, kind: 'bottle' } as Tool;
    Object.defineProperty(t, 'litres', {
      get: () => item.litres ?? 0,
      set: (v: number) => {
        item.litres = v > 0 ? v : 0;
      },
      enumerable: true,
    });
    WATER_CANS.set(item, t);
  }
  return t;
}

/** the name of a held thing (or of one lying about); a stack's says how many (built when the count changes, not every time it is asked) */
export function heldName(h: NonNullable<Held>): string {
  return h.kind === 'part' ? partDef(h.inst.part).name.zh : h.kind === 'tool' ? toolName(h.tool) : itemLabel(h.item);
}

/**
 * A thing looked at, as it is by now: it and what is in it. One that has turned becomes what its kind says,
 * in place (settleItem); true when the thing itself changed kind. `start`: it is in the hands, so one that
 * goes off and was never started is started (stampFresh) — a thing only looked at where it lies is not.
 * Nothing is made: this is asked every frame.
 */
function settleThing(it: ItemInstance, now: number, start: boolean): boolean {
  let changed = false;
  if (it.fresh !== undefined) {
    if (start && it.t0 === undefined) stampFresh(it, now);
    changed = settleItem(it, now);
  }
  const ins = it.inside;
  if (ins) {
    for (let i = 0; i < ins.length; i++) {
      const x = ins[i];
      if (x.fresh === undefined) continue;
      if (start && x.t0 === undefined) stampFresh(x, now);
      settleItem(x, now);
    }
  }
  return changed;
}

/** the bar under the slot of each thing that holds things: one object a thing, filled in again when asked (nothing is made per frame) */
const BOX_FILL = new WeakMap<ItemInstance, { value: number; max: number; tone: Tone }>();

function boxFill(it: ItemInstance, holds: NonNullable<ItemDef['holds']>): { value: number; max: number; tone: Tone } {
  let f = BOX_FILL.get(it);
  if (!f) {
    f = { value: 0, max: 1, tone: 'mid' };
    BOX_FILL.set(it, f);
  }
  f.value = boxFullness(it, holds);
  return f;
}

/** a loose thing as it would be in the hands */
export function heldOf(l: Loose): NonNullable<Held> {
  return l.part ? { kind: 'part', inst: l.part } : l.tool ? { kind: 'tool', tool: l.tool } : { kind: 'item', item: l.item! };
}

/** what the mark is on, and what the buttons would do to it (dist may be nudged to rank one over another; at = how far it really is then) */
type Target = (
  | { kind: 'loose'; loose: Loose; dist: number }
  | { kind: 'ghost'; v: ModVehicle; mount: MountDef; sub: string | null; replace: boolean; dist: number }
  | { kind: 'looseSub'; loose: Loose; sub: string; dist: number }
  | { kind: 'part'; v: ModVehicle; mount: MountDef; dist: number; seatIntent?: 'sit' | 'detach' }
  /** a can at the filler its liquid goes into (open: the flap or cap is open, no shut bonnet over it) */
  | { kind: 'filler'; v: ModVehicle; liquid: LiquidKind; open: boolean; dist: number }
  /** a can held elsewhere on the body: the words say where its filler is */
  | { kind: 'pour'; v: ModVehicle; dist: number }
  /** the filler flap (or a motorcycle's tank cap), empty-handed: E opens and shuts it */
  | { kind: 'cap'; v: ModVehicle; dist: number }
  /** a spray can on what takes paint (the body, a door, a lid, a bumper, a mirror; lying about too) */
  | { kind: 'paint'; aim: PaintAim; dist: number }
  /** the skin round a front seat, empty-handed, from beside it: in to that seat (seatFor) */
  | { kind: 'enter'; v: ModVehicle; seat: 'driver' | 'pass'; dist: number }
  /** the skin anywhere else, empty-handed: the vehicle's card (what it still needs), nothing done by a press */
  | { kind: 'body'; v: ModVehicle; dist: number }
  /** own: the device is one a V3 system put in the world (kernel/interact.ts): whatever its code throws is set apart */
  | { kind: 'device'; device: GarageDevice; dist: number; own?: true }
  /** a fuel tank that is not a vehicle's (the generator's): empty hands open its cap, a jerrycan pours */
  | { kind: 'tank'; port: TankPort; dist: number }
  /** the thing in the hands held into a vehicle's boot, bed or seat: where it would go */
  | { kind: 'stow'; aim: StowAim; dist: number }
) & { at?: number };

/** what a cleaning tool is on (grime.ts): a vehicle's part or its body, or a part lying about, and the point */
export interface ScrubHit {
  v: ModVehicle | null;
  loose: Loose | null;
  /** the grime mask's key, the look's owner, the part (null: a body) */
  key: string;
  owner: string;
  inst: PartInstance | null;
  /** 1 a body (its sides and windows), 0 a part */
  kind: 0 | 1;
  /** what to call it */
  label: string;
  /** where (render space), the surface's normal there, how far from the eye */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  glass: boolean;
}

/** what a spray can is on (paint.ts): the body or a part of a vehicle, or a part lying about, and the point */
export interface PaintAim {
  v: ModVehicle | null;
  loose: Loose | null;
  /** the part (null: the vehicle's body), the mount it is on */
  inst: PartInstance | null;
  mount: string | null;
  /** the look's owner (CarMaterials) */
  owner: string;
  /** what to call it ("左前门", the vehicle's name for its body) */
  label: string;
  /** where (render space), the surface's normal there, how far from the eye */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  dist: number;
  /** it takes paint (else: a seat, a wheel, a lamp — said so) */
  paintable: boolean;
}

/** the scrubbing in hand: the view held still, the mouse moving the tool over the surface */
export interface Scrub {
  /** the mouse's point on the screen (−1…1 both ways) */
  cursor: THREE.Vector2;
  /** what is under it now (null: nothing that cleans) */
  hit: ScrubHit | null;
  /** where the tool was last frame (on the same thing), and what that was */
  last: THREE.Vector3 | null;
  lastKey: string;
  /** the line of the strokes (smoothed, along the surface), and how fast it moves (m/s) */
  dir: THREE.Vector3;
  speed: number;
  /** the tool's way of working */
  cleaner: Cleaner;
}

/** a fuel tank that is not a vehicle's, which a jerrycan is held to (the generator's) */
export interface TankPort {
  readonly id: string;
  readonly tank: FuelTank;
  /** what it is called on the strip ("发电机的油箱") */
  readonly name: string;
  /** its cap off (it can be poured into) */
  open: boolean;
  /** how far along the line of sight (render space) it meets the filler; null: it misses */
  hit(ray: THREE.Ray, reach: number): number | null;
  /** the mouth and the way out of it (render space), for the can to line up with */
  mouth(m: THREE.Vector3, out: THREE.Vector3): boolean;
  readonly card: ItemCard;
  /** liquid went in or out, or the cap moved */
  changed(): void;
  /** a filling station's pump: a jerrycan is filled from it (E), nothing goes back in; no cap */
  readonly pump?: boolean;
}

export interface PlayerHost {
  /** what is still wanting of the set a thing belongs to, in a line for its card ("还缺：咖啡壶、咖啡豆"); null: no set, or the set is whole */
  kitNote?(h: NonNullable<Held>): string | null;
  readonly vehicles: readonly ModVehicle[];
  readonly loose: LooseThings;
  readonly ui: ModUI;
  readonly origin: { x: number; y: number; z: number };
  readonly devices: readonly GarageDevice[];
  /** more devices, handed out by where one stands: what the V3 systems put in the world (kernel/interact.ts); absent: none */
  readonly interact?: InteractSources;
  /** the tanks that are not vehicles' (the generator's) */
  readonly tanks: readonly TankPort[];
  /** a vehicle's build changed: tell the systems, the view and any listeners (the checklist) */
  changed(v: ModVehicle, what: string): void;
  /** into a front seat: the driver's, or the passenger's (docs/V3/nodes/M1-interact.md) */
  enter(v: ModVehicle, at?: 'driver' | 'pass'): void;
  /** a wreck by the road, for its parts only: not got into (docs/V3/plan/growth.md 定案 2); absent: every vehicle may be */
  partsOnly?(v: ModVehicle): boolean;
  /** into a vehicle's living space by a door, and out of it (docs/V3/nodes/M2-rv.md) */
  /** in by a doorway: standing just inside it, facing the way one came in (`lookYaw`, the view's; none: straight in) */
  board(v: ModVehicle, door: BoardDoor, lookYaw?: number): void;
  alight(v: ModVehicle, door: BoardDoor): void;
  /** may one go into its living space now (it stands still; an elevating roof is up): if not, says why */
  mayBoard(v: ModVehicle): boolean;
  sound(name: string, gain?: number, mount?: string): void;
  /** the picture of a held thing for the hotbar (a data URL), null while it is being drawn */
  iconOf(h: NonNullable<Held>): string | null;
  /** the things stowed in vehicles */
  readonly cargo: CargoBay;
  /** something came out of a vehicle or went into it: its load weighed again */
  cargoChanged(v: ModVehicle): void;
  /** eaten or taken (food, pills): what it does to one */
  consume(item: ItemInstance): void;
  /** drunk: so much of a liquid */
  drank(liquid: DrinkLiquid, litres: number): void;
  /** the eye (the scrub's cursor is cast from it) */
  readonly camera: THREE.Camera;
  /** the point of something that can be cleaned a ray (render space) meets first, within far */
  grimeCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): ScrubHit | null;
  /** a stroke of a cleaning tool over it, from a to b (render space); side: the blade's line across */
  scrubStroke(hit: ScrubHit, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, tool: Tool, c: Cleaner, dt: number): void;
  /** the scrubbing stopped (the button let go): what it was last on */
  scrubEnd(last: ScrubHit | null, tool: Tool): void;
  /** what a spray can held along the ray would paint (the thing the ray meets first, within far) */
  paintCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): PaintAim | null;
  /** a door or a lid was opened or shut (a wreck's first look under its bonnet: wrecks.ts) */
  panelOpened?(v: ModVehicle, mount: string, open: boolean): void;
  /** the can sprayed at it for dt seconds: the coat goes on, the can empties (paint.ts) */
  spray(aim: PaintAim, can: Tool, dt: number): SprayResult;
  /** how much of what the can is aimed at a coat covers (dry: set, wet: still wet), null: no coat on it (coat.ts) */
  coatOn?(aim: PaintAim): { dry: number; wet: number } | null;
  /** a list is open (Tab): G there puts the thing in the hands into the list, so the hands do not offer G for putting it down */
  readonly listOpen?: boolean;
}

/** a zone is in reach: one of the panels it is reached through open, or not there at all */
export function zoneOpen(v: ModVehicle, zone: CargoZone): boolean {
  if (!zone.via?.length) return true;
  return zone.via.some((m) => !v.build.parts[m] || !v.view.hasPanel(m) || v.view.panelOpen(m) > 0.5);
}

/** what F takes off a part lying about: its tyre (a wheel), else its turbo (an engine) */
/** what a part in the hands goes onto as a sub-part: a tyre onto a rim, a turbo onto an engine (null: a mount of its own) */
function subOf(inst: PartInstance): 'tire' | 'turbo' | null {
  const c = partDef(inst.part).cat;
  return c === 'tire' ? 'tire' : c === 'turbo' ? 'turbo' : null;
}

function subOff(l: Loose): 'tire' | 'turbo' | null {
  return l.part?.sub.tire ? 'tire' : l.part?.sub.turbo ? 'turbo' : null;
}

const REACH = 2.6;
/** the hand's reach looking level, and looking steeply down or up (m: Nomad Drive's, docs/V3/plan/hands.md §二.2) */
const REACH_LEVEL = 2.15;
const REACH_STEEP = 3.36;
/** a tool's reach to the surface it works on (a can, a scraper, the grinder): as before */
const TOOL_REACH = 2.6;
/** the parts under a car, reached through the skin over them with empty hands (one cannot see them from standing) */
const UNDER_CATS: ReadonlySet<string> = new Set(['fuelTank', 'gearbox', 'exhaust']);
/** compatible empty assembly slots light up within 15 m (Nomad Drive radius), sampled every 0.1 s */
const GHOST_NEAR = 15;
const GHOST_TICK_S = 0.1;
/** getting in (the player's ask, 2026-11-26): the walker within this of the seat on the plan (m) … */
const SEAT_NEAR = 1.7;
/** … and the mark, on the vehicle's skin, within this of it (m): the door's frame by it, not the back of a camper */
const SEAT_HIT = 0.95;
/** how far round the drawn hologram's box the mark still counts as on it (m) */
const GHOST_PAD = 0.05;
/** the card of what the mark is on shows as far as the hand reaches it (m: Nomad Drive's card is up whenever a part is aimed at) */
const CARD_NEAR = REACH_STEEP;
const GHOST_RANGE = 4.2;
/** angle (rad) within which the mark picks a ghost */
const GHOST_CONE = 0.2;
const DROP_HOLD = 0.45;
/** F on an appliance (docs/V3/nodes/M2-rv.md): let go within this long it was a press (s), held this long it is picked up */
const TAP_S = 0.25;
const GRAB_S = 0.9;
/** a hold on what a press also works takes at least this long, all told (s: Nomad Drive's, docs/V3/plan/hands.md §二.4) */
const HOLD_MIN_S = 0.9;

/** what each liquid is called, and its colour on the bars */
const LIQUID: Record<LiquidKind, { zh: string; into: string; filler: string; tone: Tone }> = {
  fuel: { zh: '油', into: '油箱', filler: '加油口', tone: 'petrol' },
  water: { zh: '水', into: '散热器', filler: '加水口', tone: 'water' },
  oil: { zh: '机油', into: '发动机', filler: '加机油口', tone: 'oil' },
};

/** the left button: primary work (and promoted secondary when target has no primary) */
const E: Action['keys'] = ['LMB'];
/** E: secondary interact on functional targets, and held secondary use (eat, drink, wear, flashlight, photo, blueprint) */
const F: Action['keys'] = ['E'];
/** Nomad Drive throw limits: max mass (kg), tap speed (m/s), full charge speed (m/s), upward pitch bias (rad) */
const THROW_MAX_KG = 15;
const THROW_MIN_MS = 4;
const THROW_MAX_MS = 14;
const THROW_UP_RAD = (8 * Math.PI) / 180;

/** zero-allocation live view of the living space the free 3D FootWalker is physically standing inside */
export interface InsideSpace {
  readonly v: ModVehicle;
  readonly def: NonNullable<ReturnType<typeof aboardOf>>;
  readonly w: {
    readonly x: number;
    readonly z: number;
    readonly yaw: number;
    place(lx: number, lz: number, yaw?: number): void;
  };
  heading(): number;
  toWorld(x: number, y: number, z: number, origin: { x: number; y: number; z: number }, out: { x: number; y: number; z: number }): { x: number; y: number; z: number };
}

/** Nomad Drive surface-carry micro-jitter deadband: skip deltas below 0.5 mm and 0.02 deg */
const CARRY_MIN_POS = 0.0005;
const CARRY_MIN_YAW = (0.02 * Math.PI) / 180;

export class ModPlayer {
  readonly walker: FootWalker;
  /** vehicle living space the free 3D walker is physically standing inside (null: outside) */
  private insideVeh: ModVehicle | null = null;
  private readonly insideModelP = { x: 0, y: 0, z: 0 };
  private readonly insideBasis = new Float64Array(9);
  private readonly insideV3 = new THREE.Vector3();
  private readonly insideProxy: InsideSpace;

  /**
   * Read-only view of the vehicle living space the free 3D walker currently stands in (null when outside).
   * Walking in and out is 100% free 3D FootWalker movement — no separate 2D Aboard mode or doorway transit.
   */
  get aboard(): InsideSpace | null {
    return this.insideVeh ? this.insideProxy : null;
  }

  /** vehicle whose moving surface currently carries the on-foot walker (Nomad Drive PlayerVehicleSurfaceAttachment) */
  attachedVehicle: ModVehicle | null = null;
  private carryGraceT = 0;
  private carryRef = { valid: false, x: 0, y: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, yaw: 0 };
  private readonly carryQ0 = new THREE.Quaternion();
  private readonly carryQ1 = new THREE.Quaternion();
  private readonly carryV = new THREE.Vector3();

  /**
   * Held where a system says (docs/ND/PLAN.md: sitting on a chair or a sofa), set by it each frame before this
   * one's update: where the feet are (world), how high the eye is above them, the words to show besides. The walk
   * is still (no steps, no jump, nothing put down with G); what the mark is on works as ever. null: walking.
   */
  pin: { x: number; y: number; z: number; eye: number; words: readonly Action[]; ring?: number } | null = null;
  /**
   * The vehicle whose roof one is up on (from its ladder or standing on its roof: v3/ladder, J9e), set each frame:
   * nobody gets into a seat from up on its roof; null: not up on one
   */
  onRoof: ModVehicle | null = null;

  /** attach walker to a vehicle's moving surface with optional grace window (e.g. 0.5 s after seat exit / ladder release) */
  attachVehicle(v: ModVehicle | null, graceS = 0): void {
    this.attachedVehicle = v;
    this.carryGraceT = v ? Math.max(this.carryGraceT, graceS) : 0;
    if (v) this.stampCarryRef(v);
    else this.carryRef.valid = false;
  }

  /** detach from any vehicle surface carry immediately (e.g. entering a seat) */
  detachVehicle(): void {
    this.attachedVehicle = null;
    this.carryGraceT = 0;
    this.carryRef.valid = false;
  }

  private stampCarryRef(v: ModVehicle): void {
    const s = v.sim;
    const r = this.carryRef;
    r.valid = true;
    r.x = s.px;
    r.y = s.py;
    r.z = s.pz;
    r.qx = s.qx;
    r.qy = s.qy;
    r.qz = s.qz;
    r.qw = s.qw;
    r.yaw = s.yaw;
  }

  /** capture current sim pose before vehicles step this frame */
  prepareCarry(): void {
    const v = this.attachedVehicle;
    if (!v) return;
    if (!this.host.vehicles.includes(v)) {
      this.detachVehicle();
      return;
    }
    if (!this.carryRef.valid) this.stampCarryRef(v);
  }

  /**
   * Per-frame vehicle surface attachment & carry (Nomad Drive PlayerVehicleSurfaceAttachment):
   *  - Grounded on any vehicle solid (`veh:<uid>:*`): attaches to that vehicle and carries feet + yaw with its motion
   *    (skipping sub-0.5 mm / 0.02 deg micro-jitter, never tipping view pitch/roll).
   *  - Airborne after grace expires: detaches and imparts the vehicle's horizontal velocity onto the walker.
   */
  stepVehicleCarry(dt: number, input?: { lookYaw: number }): void {
    if (this.carryGraceT > 0) this.carryGraceT = Math.max(0, this.carryGraceT - dt);
    const w = this.walker;

    // 1. Apply pose delta from vehicles stepping this frame while attached
    const cur = this.attachedVehicle;
    if (cur && this.carryRef.valid && !this.pin) {
      if (!this.host.vehicles.includes(cur)) {
        this.detachVehicle();
      } else {
        const s = cur.sim;
        const r = this.carryRef;
        const dx = s.px - r.x;
        const dy = s.py - r.y;
        const dz = s.pz - r.z;
        let dYaw = s.yaw - r.yaw;
        while (dYaw > Math.PI) dYaw -= Math.PI * 2;
        while (dYaw < -Math.PI) dYaw += Math.PI * 2;
        const moved = Math.hypot(dx, dy, dz);
        if (moved >= CARRY_MIN_POS || Math.abs(dYaw) >= CARRY_MIN_YAW) {
          this.carryQ0.set(r.qx, r.qy, r.qz, r.qw);
          this.carryQ1.set(s.qx, s.qy, s.qz, s.qw).multiply(this.carryQ0.invert());
          this.carryV.set(w.x - r.x, w.y - r.y, w.z - r.z).applyQuaternion(this.carryQ1);
          w.x = s.px + this.carryV.x;
          w.y = s.py + this.carryV.y;
          w.z = s.pz + this.carryV.z;
          // Yaw only: never tip player view with vehicle pitch/roll
          w.heading -= dYaw;
          if (input) input.lookYaw -= dYaw;
          this.stampCarryRef(cur);
        }
      }
    }

    // 2. Refresh attachment state from current walker footing
    if (this.pin) {
      if (this.attachedVehicle) this.stampCarryRef(this.attachedVehicle);
      return;
    }
    if (w.grounded && w.floorTag.startsWith('veh:')) {
      let owner: ModVehicle | null = null;
      const vs = this.host.vehicles;
      for (let i = 0; i < vs.length; i++) {
        if (vs[i].walkSolids.ownsTag(w.floorTag)) {
          owner = vs[i];
          break;
        }
      }
      if (owner && owner !== this.attachedVehicle) {
        this.attachedVehicle = owner;
        this.stampCarryRef(owner);
      } else if (!owner && this.attachedVehicle && this.carryGraceT <= 0) {
        this.detachVehicle();
      }
    } else if (this.attachedVehicle && this.carryGraceT <= 0) {
      // Detach: if airborne (e.g. jumped off a moving bed/camper/roof), impart vehicle horizontal velocity
      const v = this.attachedVehicle;
      if (!w.grounded && v.sim.speed > 0.15) {
        w.vx += v.sim.vx;
        w.vz += v.sim.vz;
      }
      this.detachVehicle();
    }
    this.refreshInside();
  }

  /** query active EntryAssistZones across all nearby vehicles (zero allocations) */
  private entryStepLimitAt(x: number, y: number, z: number): number {
    let best = 0;
    const vs = this.host.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const s = vs[i].walkSolids?.entryStepLimit(x, y, z) ?? 0;
      if (s > best) best = s;
    }
    return best;
  }

  /** refresh which vehicle's living space the free 3D walker is physically inside */
  refreshInside(): void {
    const w = this.walker;
    let found: ModVehicle | null = null;
    const vs = this.host.vehicles;
    for (let i = 0; i < vs.length; i++) {
      const v = vs[i];
      if (v.walkSolids?.insideLiving(w.x, w.y, w.z)) {
        found = v;
        break;
      }
    }
    this.insideVeh = found;
  }
  readonly solids = new SolidSet();
  readonly input: FootInput = { forward: 0, right: 0, run: false, crouch: false, jump: false };
  /** the hotbar: two things carried (more with a backpack on), the selected one in the hands */
  readonly slots: Held[] = [null, null];
  /** the backpack one has on (its slots are the hotbar's after the first two) */
  pack: ItemInstance | null = null;
  sel = 0;
  target: Target | null = null;
  readonly ghosts = new GhostLayer();
  /** assists: the holograms, the stat card (the ghosts' targeting works without them) */
  showGhostsOn = true;
  showCardOn = true;
  /** the item cards (I shows and hides them) */
  cardsOn = true;
  /** with a spray can: what it is on (paintable or not) */
  paintAim: PaintAim | null = null;
  /** spraying (the button held on what takes paint, paint in the can): what, how far along its coat is */
  spraying: { aim: PaintAim; t: number } | null = null;
  /** the button went down with an empty can (the game sputters) */
  sprayDry = false;
  /** the turn of the thing about to be stowed (the wheel, in steps of 15°), relative to the vehicle */
  stowYaw = 0;
  /** the vehicle the line of sight is on (its body, within reach): G held puts the thing in it */
  lookVehicle: ModVehicle | null = null;
  /** current aimed outline target for Frame's 4.6 px white silhouette pass (null: none) */
  outlineTarget: OutlineTarget | null = null;
  /** Q throw charge fraction (0..1) while holding Q on foot */
  qCharge = 0;
  /** liquid transfer direction at open vehicle filler / tank: false = pour in, true = siphon out (toggled by Wheel) */
  private pourOut = false;
  private pourTargetKey = '';
  /** true when the currently held HandsUse claims RMB (placement free rotate, camera finder, print inspect) */
  get rmbClaimed(): boolean {
    const hu = this.handsUse();
    return !!(hu && this.held && hu.takesRmb?.(this.held));
  }
  /** progress of the hold in hand (0…1), and what it is for (a target key) */
  progress = 0;
  private progressKey = '';
  private dropT = 0;
  /**
   * A fit or a take-off just finished with the button still down: nothing more until it is let go (with
   * holds this short, a button held on would put the part on, the old one back, and so on). A hands use sets it
   * too once it has done its work (a mending kit: the empty hands must not take off what it mended).
   */
  spent = false;
  /** how long F has been held to put a backpack on */
  private selectT = 0;
  /** the buttons */
  primary = false;
  secondary = false;
  /** the systems' own ways with things in the hands (HandsUse): the first that claims it has the buttons */
  readonly hands: HandsUse[] = [];
  /** a system's line for whatever is in the hands, under the thing's own down the right (docs/ND/PLAN.md: R places it); null: none now */
  readonly keyNotes: ((held: NonNullable<Held>) => Action | null)[] = [];
  /** the one that had them last frame, and with what (told when the thing leaves the hands) */
  private handsWas: { use: HandsUse; held: NonNullable<Held> } | null = null;
  /** with a cleaning tool: what the mark is on that it can clean (the left button held scrubs it) */
  scrubAim: ScrubHit | null = null;
  /** scrubbing (the left button held with a cleaning tool): null when not */
  scrub: Scrub | null = null;
  private readonly sv1 = new THREE.Vector3();
  private readonly sv2 = new THREE.Vector3();
  private readonly sv3 = new THREE.Vector3();
  private readonly sv4 = new THREE.Vector3();
  private secondaryWas = false;
  /** the right button as the last frame had it (its press: sayWhy) */
  private rightWas = false;
  /**
   * What each button would do now, as the words last said it (docs/V3/plan/prompts.md §五): the words of what it
   * cannot do (a press of it, a hold of it), and whether it does anything at all — pressed where it does nothing but
   * cannot, it says why for a moment.
   */
  private readonly offs = new Map<string, { tap: string | null; hold: string | null; on: boolean; onHold: boolean }>();
  /** a button held where a hold cannot be done: why, once it has been down long enough to have started one */
  private holdWhy: { k: string; why: string; t: number; said: boolean } | null = null;
  /** a button pressed where a press would do nothing but a hold would: why, if it comes up soon enough to have been a press */
  private tapWhy: { k: string; why: string; t: number } | null = null;
  private lastWhy = '';
  private lastWhyAt = -1e9;
  /**
   * Something being eaten, drunk or taken (F or the right button): what, how long since it began, from which
   * slot; drinking goes on while the button is held
   */
  use: { kind: 'eat' | 'pill' | 'drink'; t: number; slot: number; item: ItemInstance; dur: number } | null = null;
  private bites = 0;
  /** the bites of the meal going on so far (the sound of eating: ModGame.sound) */
  get biteCount(): number {
    return this.bites;
  }
  private primaryEdge = false;
  readonly eye = { x: 0, y: 0, z: 0 };
  readonly dir = { x: 1, y: 0, z: 0 };
  private readonly box = new THREE.Box3();
  private readonly ray = new THREE.Ray();
  private readonly hit = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private cardKey = '';
  private cardCache: ReturnType<typeof compare> | null = null;
  /** liquid going from the can into a vehicle (in) or out of it into the can (out), and how much so far */
  flow: { dir: 'in' | 'out'; v: ModVehicle | null; port?: TankPort; liquid: LiquidKind; moved: number; fuel: string } | null = null;
  /** litres the flow moved this frame (0: none, or nothing left to move) */
  lastMoved = 0;
  private vehicleCardCache: { key: string; t: number; card: ItemCard } | null = null;
  private clock = 0;

  constructor(
    land: Land,
    private readonly host: PlayerHost,
  ) {
    this.walker = new FootWalker(land, this.solids);
    this.walker.setProfile(ND_FOOT);
    this.walker.stepLimit = (x, y, z) => this.entryStepLimitAt(x, y, z);
    const self = this;
    this.insideProxy = {
      get v() {
        return self.insideVeh!;
      },
      get def() {
        return aboardOf(self.insideVeh!.view.frame.id)!;
      },
      w: {
        get x() {
          const v = self.insideVeh!;
          return v.walkSolids.worldToModel(self.walker.x, self.walker.y, self.walker.z, self.insideModelP).x;
        },
        get z() {
          const v = self.insideVeh!;
          return v.walkSolids.worldToModel(self.walker.x, self.walker.y, self.walker.z, self.insideModelP).z;
        },
        get yaw() {
          return self.walker.heading - self.insideProxy.heading();
        },
        place(lx: number, lz: number, yaw?: number) {
          const v = self.insideVeh;
          if (!v) return;
          const def = aboardOf(v.view.frame.id);
          const area = def?.areas.find((a) => lx >= a.x0 && lx <= a.x1 && lz >= a.z0 && lz <= a.z1) ?? def?.areas[0];
          const fy = area?.floor ?? 0.6;
          const p = self.insideProxy.toWorld(lx, fy, lz, self.host.origin, self.insideModelP);
          const h = yaw !== undefined ? self.insideProxy.heading() + yaw : self.walker.heading;
          self.walker.placeAt(p.x, p.y, p.z, h);
          self.attachVehicle(v, 0.5);
          self.refreshInside();
        },
      },
      heading() {
        const v = self.insideVeh!;
        v.sim.basis(self.insideBasis);
        return Math.atan2(self.insideBasis[2], self.insideBasis[0]);
      },
      toWorld(x, y, z, origin, out) {
        const m = self.insideVeh!.view.model;
        m.updateMatrixWorld();
        self.insideV3.set(x, y, z).applyMatrix4(m.matrixWorld);
        out.x = self.insideV3.x + origin.x;
        out.y = self.insideV3.y + origin.y;
        out.z = self.insideV3.z + origin.z;
        return out;
      },
    };
  }

  /** what is in the hands: the selected slot */
  get held(): Held {
    return this.slots[this.sel];
  }

  set held(h: Held) {
    this.slots[this.sel] = h;
  }

  /** a slot something picked up can go into: the selected one when it is empty, else the first empty one; −1 = all full */
  freeSlot(): number {
    const s = this.slots;
    if (!s[this.sel]) return this.sel;
    for (let i = 0; i < s.length; i++) if (!s[i]) return i;
    return -1;
  }

  /**
   * Where the first of the thing last asked about (roomFor) would go: 1 onto the stack in slot `goesSlot`,
   * 2 into the thing in that slot that holds its sort, 3 into that slot, free (0: nowhere). The prompt reads
   * them straight after asking.
   */
  private goes = 0;
  private goesSlot = -1;

  /** could anything in the slots take more than a free slot does: a stack, or a thing that holds things? (With neither, room is a free slot and nothing else, as it always was.) */
  private handsTakeIn(): boolean {
    const s = this.slots;
    for (let i = 0; i < s.length; i++) {
      const h = s[i];
      if (h?.kind !== 'item') continue;
      const d = itemDef(h.item.item);
      if ((d.stack ?? 1) > 1 || d.holds) return true;
    }
    return false;
  }

  /**
   * How many of this thing the hands would take now (0: none; a stack counts its count): onto the stacks of
   * its sort in the slots, then into the things in the slots that hold its sort, then (all that is left) into
   * a free slot — what receive would do, in its order. Changes nothing and allocates nothing: the prompt asks
   * it every frame. `not`: a thing in the hands it must not go into (the basket it is being taken out of).
   * (V3 item model, docs/V3/nodes/N0-items-hands.md.)
   */
  roomFor(h: NonNullable<Held>, not: ItemInstance | null = null): number {
    if (h.kind === 'item') return this.roomForItem(h.item, not);
    const slot = this.freeSlot();
    this.goes = slot >= 0 ? 3 : 0;
    this.goesSlot = slot;
    return slot >= 0 ? 1 : 0;
  }

  private roomForItem(it: ItemInstance, not: ItemInstance | null): number {
    this.goes = 0;
    this.goesSlot = -1;
    const total = countOf(it);
    if (total <= 0) return 0;
    let left = total;
    if (this.handsTakeIn()) {
      const s = this.slots;
      const now = itemNow();
      const max = stackMax(it.item);
      // onto the stacks of its sort
      if (max > 1) {
        for (let i = 0; i < s.length && left > 0; i++) {
          const h = s[i];
          if (h?.kind !== 'item' || h.item === it || h.item === not || !canStack(h.item, it, now)) continue;
          const k = Math.min(left, max - countOf(h.item));
          if (k <= 0) continue;
          if (!this.goes) {
            this.goes = 1;
            this.goesSlot = i;
          }
          left -= k;
        }
      }
      // into the things that hold its sort (each asked about all of it: what one would take does not depend on how many are offered)
      for (let i = 0; i < s.length && left > 0; i++) {
        const h = s[i];
        // (not one that is opened to be put into — a nightstand's drawer: ItemDef.holds.shut)
        if (h?.kind !== 'item' || h.item === it || h.item === not || !itemDef(h.item.item).holds || itemDef(h.item.item).holds!.shut) continue;
        const k = Math.min(left, roomInside(h.item, it, now));
        if (k <= 0) continue;
        if (!this.goes) {
          this.goes = 2;
          this.goesSlot = i;
        }
        left -= k;
      }
    }
    // a free slot takes all that is left
    if (left > 0) {
      const slot = this.freeSlot();
      if (slot >= 0) {
        if (!this.goes) {
          this.goes = 3;
          this.goesSlot = slot;
        }
        left = 0;
      }
    }
    return total - left;
  }

  /** the filter of the things lying about when no slot is free: only those the stacks and the baskets in the hands have room for */
  private readonly takesLoose = (l: Loose): boolean => !!l.item && this.roomForItem(l.item, null) > 0;

  /**
   * The hands take a thing: THE one way a thing enters the hands (a list, a bench, a device, a script, and
   * the player's own pick-up). It goes onto the stacks of its sort in the slots, then into the things in the
   * slots that hold its sort, then into a free slot (the selected one when empty, else the first empty).
   * Returns how many of it did not go in: 0 when all of it did — the caller lets go of it then, whatever its
   * count reads (it sits in a slot or in a basket itself, or it went onto stacks and its count reads 0);
   * otherwise the thing stays the caller's, with that count. `not`: a thing in the hands it must not go into
   * (the basket it is being taken out of).
   *
   * Which slot is selected is left alone: a caller that wants the thing in the hands selects the slot it is
   * in afterwards (the player's own pick-up does, and the lists). Nothing about the slots is remembered from
   * one call to the next: a caller may empty a slot for the call and fill it again after (a list taking a
   * thing out of a basket that is itself in the hands lets the basket step out of its slot meanwhile).
   *
   * A thing that has turned is what it turned into by now (settled as it is handed over, whether it then goes
   * in or not). One that goes into a slot goes off in the open air from now on, and is started if it never
   * was; into a basket: at the basket's rate. What does not go in is left as it was.
   */
  receive(h: NonNullable<Held>, not: ItemInstance | null = null): number {
    if (h.kind === 'item') {
      const it = h.item;
      const now = itemNow();
      const s = this.slots;
      // (handed a thing that is in the hands already: there it is)
      for (let i = 0; i < s.length; i++) {
        const x = s[i];
        if (x?.kind === 'item' && x.item === it) return 0;
      }
      settleThing(it, now, false);
      let left = countOf(it);
      if (left <= 0) return 0;
      if (stackMax(it.item) > 1) {
        for (let i = 0; i < s.length && left > 0; i++) {
          const x = s[i];
          if (x?.kind === 'item' && x.item !== not) left = mergeStacks(x.item, it, now);
        }
      }
      for (let i = 0; i < s.length && left > 0; i++) {
        const x = s[i];
        if (x?.kind === 'item' && x.item !== not && itemDef(x.item.item).holds && !itemDef(x.item.item).holds!.shut) left = putInside(x.item, it, now);
      }
      if (left <= 0) return 0;
      const slot = this.freeSlot();
      if (slot < 0) return left;
      // (into a slot: in the open air from here, and started if it never was, with what is in it)
      stampFresh(it, now);
      setFreshRate(it, now, 1);
      s[slot] = h;
      return 0;
    }
    const slot = this.freeSlot();
    if (slot < 0) return 1;
    this.slots[slot] = h;
    return 0;
  }

  /**
   * One of what is in a slot, out of the hands for good (eaten, taken, used up): the thing itself when it is
   * the last one (the slot is then empty), else one taken off the stack, which stays in its slot. null: no
   * such thing there.
   */
  takeOne(slot: number): ItemInstance | null {
    const h = this.slots[slot];
    if (h?.kind !== 'item') return null;
    const one = splitStack(h.item, 1);
    if (one) return one;
    this.slots[slot] = null;
    return h.item;
  }

  /**
   * What is in the hands looked at (every frame on foot, and as the hotbar is drawn): a thing that has turned
   * becomes what its kind says, in place. Its picture, its model in the hand, its name and its card all go by
   * its kind, so they are made again by themselves; a bite of it under way stops.
   */
  private settleHands(): void {
    const s = this.slots;
    for (let i = 0; i < s.length; i++) {
      const h = s[i];
      if (h?.kind !== 'item') continue;
      const it = h.item;
      // (a thing that neither goes off nor has anything in it: nothing to look at, the clock is not even read)
      if (it.fresh === undefined && !it.inside) continue;
      if (settleThing(it, itemNow(), true) && this.use?.item === it) {
        this.use = null;
        this.progress = 0;
      }
    }
  }

  /** the clothes one has on, by where they go (docs/V3/plan/growth.md 定案 5): their warmth keeps the cold out */
  worn: Partial<Record<WearSlot, ItemInstance>> = {};

  /**
   * Put a piece of clothing on, from the hands: what was in its place comes into the hands it leaves. False
   * (nothing done): it is not clothing.
   */
  wearClothes(item: ItemInstance): boolean {
    const slot = itemDef(item.item).wear?.slot;
    if (!slot) return false;
    const from = this.slots.findIndex((h) => h?.kind === 'item' && h.item === item);
    const old = this.worn[slot];
    if (from >= 0) this.slots[from] = old ? { kind: 'item', item: old } : null;
    this.worn[slot] = item;
    return true;
  }

  /** a piece of clothing off into the hands (a free slot: the one selected first); false: no hand free */
  takeOff(slot: WearSlot): boolean {
    const it = this.worn[slot];
    if (!it) return false;
    const i = !this.slots[this.sel] ? this.sel : this.slots.findIndex((h) => !h);
    if (i < 0) return false;
    this.slots[i] = { kind: 'item', item: it };
    delete this.worn[slot];
    return true;
  }

  /**
   * Put a backpack on (null: take it off): the hotbar gets its slots after the first two. Another one on
   * already comes into the hands. False (nothing done): the slots that would go are not empty.
   */
  wearPack(item: ItemInstance | null): boolean {
    const n = 2 + (item ? (itemDef(item.item).pack?.slots ?? 0) : 0);
    const old = this.pack;
    // the pack being put on leaves the hand it is in
    const from = item ? this.slots.findIndex((h) => h?.kind === 'item' && h.item === item) : -1;
    const kept = this.slots.map((h, i) => (i === from ? null : h));
    // (what is in the slots that would go must come out first; the old pack needs a free hand)
    if (kept.slice(n).some(Boolean)) return false;
    const room = kept.slice(0, n).findIndex((h) => !h);
    if (old && room < 0) return false;
    this.slots.length = 0;
    for (let i = 0; i < n; i++) this.slots.push(kept[i] ?? null);
    if (old) this.slots[room] = { kind: 'item', item: old };
    this.pack = item;
    if (this.sel >= n) this.sel = 0;
    return true;
  }

  /** the other slot into the hands (1, 2 or the wheel) */
  select(i: number): void {
    if (i === this.sel || i < 0 || i >= this.slots.length || this.flow) return;
    this.selectT = 0;
    this.use = null;
    this.sel = i;
    this.progress = 0;
    this.dropT = 0;
    this.host.sound('pickup', 0.3);
  }

  /** liquid is flowing (or the button is held at the filler): one stands still, the view holds */
  get transferring(): boolean {
    return !!this.flow;
  }

  removeSolids(s: SolidSource): void {
    this.solids.remove(s);
  }

  addSolids(s: SolidSource): void {
    this.solids.add(s);
  }

  /** the button went down this frame (a tap shorter than a frame still counts) */
  /** the use button down: E (key) or the left button (mouse) — with a cleaning tool the mouse's scrubs */
  press(from: 'key' | 'mouse' = 'key'): void {
    const hu = this.handsUse();
    if (hu?.press && this.held && hu.press(this.held, from)) return;
    if (from === 'mouse' && this.startScrub()) return;
    this.primaryEdge = true;
    this.primary = true;
  }

  release(from: 'key' | 'mouse' = 'key'): void {
    const hu = this.handsUse();
    // (the button is up whoever takes its coming up: a grinder's or a placer's own release left it down here, and the
    // next thing the mark was on with empty hands was taken off as by a hold — a door off its car after a grind)
    if (hu?.release && this.held && hu.release(this.held, from)) {
      this.primary = false;
      return;
    }
    if (from === 'mouse' && this.scrub) {
      this.endScrub();
      return;
    }
    this.primary = false;
  }

  /** the mouse moved while scrubbing (px): the tool goes with it over the surface */
  scrubMove(dx: number, dy: number): void {
    const s = this.scrub;
    if (!s) return;
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    s.cursor.x = Math.max(-0.96, Math.min(0.96, s.cursor.x + (dx * 2) / w));
    s.cursor.y = Math.max(-0.96, Math.min(0.96, s.cursor.y - (dy * 2) / h));
  }

  /** the left button with a cleaning tool on something it can clean: the scrub begins */
  private startScrub(): boolean {
    const held = this.held;
    const c = held?.kind === 'tool' ? cleanerOf(held.tool) : null;
    const aim = this.scrubAim;
    if (!c || !aim || held?.kind !== 'tool') return false;
    if ((held.tool.life ?? 1) <= 0) {
      this.flashWhy(`${TOOL_INFO[held.tool.kind].name.zh}用坏了`);
      return true;
    }
    // (the tool's line across the strokes starts level along the surface)
    const dir = new THREE.Vector3(0, 1, 0).cross(aim.normal);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    this.scrub = { cursor: new THREE.Vector2(0, 0), hit: aim, last: null, lastKey: '', dir: dir.normalize(), speed: 0, cleaner: c };
    return true;
  }

  private endScrub(): void {
    const s = this.scrub;
    this.scrub = null;
    const held = this.held;
    if (s && held?.kind === 'tool') this.host.scrubEnd(s.hit, held.tool);
  }

  /** every frame of a scrub: the cursor's ray onto the surface, a stroke from where the tool was to where it is */
  private stepScrub(dt: number): void {
    const s = this.scrub!;
    const held = this.held;
    const c = held?.kind === 'tool' ? cleanerOf(held.tool) : null;
    if (!c || held?.kind !== 'tool') {
      this.endScrub();
      return;
    }
    const cam = this.host.camera;
    const o = cam.getWorldPosition(this.sv1);
    const d = this.sv2.set(s.cursor.x, s.cursor.y, 0.5).unproject(cam).sub(o).normalize();
    const hit = this.host.grimeCast(o, d, REACH + 0.6);
    s.hit = hit;
    if (!hit) {
      s.last = null;
      s.speed *= Math.exp(-dt * 10);
      return;
    }
    const prev = s.last && s.lastKey === hit.key ? s.last : null;
    s.lastKey = hit.key;
    if (prev) {
      const move = this.sv3.subVectors(hit.point, prev);
      const len = move.length();
      // (a jump over a gap or onto another face: no stroke across it)
      if (len < 0.25) {
        s.speed = s.speed * 0.6 + (len / Math.max(dt, 1e-3)) * 0.4;
        if (len > 2e-4) {
          // the blade's line follows the strokes' (either way along them)
          move.addScaledVector(hit.normal, -move.dot(hit.normal));
          if (move.lengthSq() > 1e-10) {
            move.normalize();
            if (move.dot(s.dir) < 0) move.negate();
            s.dir.lerp(move, Math.min(1, dt * 14)).normalize();
          }
          const side = this.sv4.subVectors(hit.point, prev).cross(hit.normal).normalize();
          this.host.scrubStroke(hit, prev, hit.point, side, held.tool, c, dt);
          if (wearCleaner(held.tool, len * c.width) <= 0) {
            this.host.sound('tool_worn');
            this.flashWhy(`${TOOL_INFO[held.tool.kind].name.zh}用坏了`);
            this.endScrub();
            return;
          }
        }
      } else s.speed = 0;
    } else s.speed = 0;
    s.last = (s.last ?? new THREE.Vector3()).copy(hit.point);
  }

  wheel(delta: number): void {
    // aimed into a boot or a bed: the wheel turns the thing about to go in
    if (this.target?.kind === 'stow') {
      this.stowYaw += (delta > 0 ? -1 : 1) * (Math.PI / 12);
      return;
    }
    // liquid container aimed at an open vehicle filler or non-pump tank: Wheel flips pour <-> siphon direction (Nomad Drive)
    const tg0 = this.target;
    if (
      this.held?.kind === 'tool' &&
      liquidOf(this.held.tool) &&
      ((tg0?.kind === 'filler' && tg0.open) || (tg0?.kind === 'tank' && !tg0.port.pump && tg0.port.open))
    ) {
      this.pourOut = !this.pourOut;
      this.host.sound('switch', 0.35);
      return;
    }
    const hu = this.handsUse();
    if (hu?.wheel && this.held && hu.wheel(this.held, delta)) return;
    // (a spray can in the hands: the wheel goes through its nozzles — fine, medium, wide)
    const sh = this.held;
    if (sh?.kind === 'tool' && sh.tool.kind === 'spray') {
      // (its own three: hooked to the garage's gun, the wheel unhooks it and goes back to the medium)
      // (a size a notch, up wider, down finer, no further than the ends: Nomad Drive's seven)
      const n = CAN_NOZZLES;
      const at = sh.tool.nozzle ?? DEFAULT_NOZZLE;
      sh.tool.nozzle = at >= n ? DEFAULT_NOZZLE : Math.max(0, Math.min(n - 1, at + (delta < 0 ? 1 : -1)));
      // (the brush's shadow on the surface shows the size: nothing said)
      this.host.sound('switch', 0.4);
      return;
    }
    // (a device's second thing — a flame up or down — is the wheel's while it is looked at)
    const tg = this.target;
    if (tg?.kind === 'device' && tg.device.alt) {
      tg.device.alt.use();
      return;
    }
    // (otherwise the wheel goes through the hotbar: a spray can is one colour, Arctic Drive's)
    this.select((this.sel + (delta > 0 ? 1 : this.slots.length - 1)) % this.slots.length);
  }

  /** the hands are busy elsewhere (the bench has the view): nothing is aimed at, no prompts */
  aside = false;
  /** the thing in the hands is at it by itself this frame (kernel/heldUse.ts: a line out): no card, nothing aimed at */
  private huBusy = false;
  /** the mouse's sideways movement since the last frame while the thing in the hands has the view (px) */
  private pointerX = 0;

  /** the mouse moved while the thing in the hands has the view (kernel/heldUse.ts look()): it goes to the thing */
  heldPointer(dx: number): void {
    this.pointerX += dx;
  }

  /** Q pressed: has the thing in the hands its own way with it (kernel/heldUse.ts drop: a fish goes back into the water ahead)? true: it had, and it is done */
  heldDrop(): boolean {
    const h = this.held;
    if (h?.kind !== 'item' || this.aside) return false;
    const hu = heldUseOf(h.item);
    return !!hu?.drop && heldCall(false, () => hu.drop!(h.item, this.sel));
  }

  /** where the thing in the hands has the view look now (a rod with a fish on), or null: the view is the player's */
  heldLook(): HeldLook | null {
    const h = this.held;
    if (h?.kind !== 'item' || this.aside) return null;
    const hu = heldUseOf(h.item);
    return hu?.look ? heldCall(null, () => hu.look!(h.item, this.sel)) : null;
  }

  /** what the thing in the hands does by itself (kernel/heldUse.ts), null: nothing (a lookup: nothing is allocated) */
  private heldUse(): HeldUse | null {
    const h = this.held;
    return h?.kind === 'item' ? heldUseOf(h.item) : null;
  }

  /** the system that works the thing in the hands draws it there itself (a rod bending on its line): the game's own model of it is not shown */
  get heldDrawnElsewhere(): boolean {
    const h = this.held;
    if (h?.kind !== 'item') return false;
    const hu = heldUseOf(h.item);
    return !!hu && heldCall(false, () => hu.draws?.(h.item) ?? false);
  }

  // ------------------------------------------------------------------ every frame on foot

  update(dt: number, lookYaw: number, lookPitch: number, keys: { run: boolean; jump: boolean; drop: boolean; take: boolean; rmb?: boolean; forward: number; right: number; crouch?: boolean }): void {
    const w = this.walker;
    this.clock += dt;
    // (what is in the hands, as it is by now: before it is carried, eaten or shown)
    this.settleHands();
    // (the boxes of what is in the hotbar asked for while it is there: measured from its model, which comes a moment
    // after it is first asked for. Asked for first by Q — or by the hands' list beside a vehicle's, which packs a slot
    // in at once — a rough box stood in, 0.7 m a side for a large thing, longer than the Sugar Cube's boot, and the
    // first jerrycan of a game packed in went down on the ground, 车里放不下了: fix1. The test rigs' hosts have no boxes.)
    for (const s of this.slots) if (s) this.host.cargo.boxOf?.(s);
    // (a thing in the hands that works the buttons by itself, kernel/heldUse.ts: a rod with its line out holds the
    // hands — nothing is aimed at — and, with a fish on, the walk)
    const hu = this.heldUse();
    const hi = this.held?.kind === 'item' ? this.held.item : null;
    const huBusy = !!hu && !!hi && heldCall(false, () => hu.busy?.(hi, this.sel) ?? false);
    const huStill = !!hu && !!hi && heldCall(false, () => hu.still?.(hi, this.sel) ?? false);
    this.huBusy = huBusy;
    // (while liquid flows one stands still: from the frame the button goes down at an open filler)
    const t0 = this.target;
    const atOpen = (t0?.kind === 'filler' && t0.open) || (t0?.kind === 'tank' && t0.port.open && this.held?.kind === 'tool');
    const still = !!this.flow || (atOpen && (this.primary || keys.take)) || !!this.scrub || huStill;
    this.input.forward = still ? 0 : keys.forward;
    this.input.right = still ? 0 : keys.right;
    this.input.run = keys.run;
    this.input.jump = keys.jump && !still;
    if (this.pin) {
      this.input.forward = this.input.right = 0;
      this.input.jump = false;
    }
    // (crouched: lower, slower, quieter; the walk stands up again only where there is the headroom to)
    this.input.crouch = !!keys.crouch;
    w.heading = lookYaw;
    w.pitch = lookPitch;
    const h = this.held;
    // the walk by what it weighs (walkShare: Nomad Drive's at the light end; running only under 10 kg, as Nomad
    // Drive's; no jumping with 20 kg or more) — docs/V3/plan/growth.md §1.7, J2. A kind
    // that says how one walks with it (Nomad Drive's furniture, carried about as fast as empty hands) says so.
    const kg = h ? partMass(h) : 0;
    const cw = h?.kind === 'item' ? itemDef(h.item.item).carryWalk : undefined;
    w.load = 'none';
    w.loadShare = cw?.share ?? walkShare(kg);
    w.loadRun = cw?.run ?? kg < 10;
    w.loadJump = !!cw || kg < 20;
    const pin = this.pin;
    if (pin) w.hold(pin.x, pin.y, pin.z, pin.eye, dt);
    else w.advance(dt, this.input);
    this.refreshInside();
    this.input.jump = false;
    // (the view's eye: the walker's and how far her head carries the view from it — walker.viewShift)
    w.eye(this.eye);
    w.look(this.dir);
    this.secondaryWas = this.secondary;
    this.secondary = keys.take;

    this.frameDt = dt;
    this.target = this.aside || huBusy ? null : this.pick();
    // Target beats held item on E: if the aimed target has a secondary E action (detach panel/seat/sub, grab appliance),
    // withhold E from held-item systems and held uses this frame.
    const targetE = this.targetClaimsE(this.target, this.held);
    this.stepHands(dt, targetE ? false : keys.take, !!keys.rmb);
    // (the hands put aside — placing: no tool works, and none says it would)
    if (this.aside) {
      this.scrubAim = null;
      this.paintAim = null;
    }
    if (this.scrub) this.stepScrub(dt);
    this.showHighlight();
    this.showGhosts();
    this.host.cargo.showGhost(this.target?.kind === 'stow' ? this.target.aim : null, this.held);
    // the thing in the hands takes the buttons it works (kernel/heldUse.ts): the rest of the hands do not see them
    // this frame (a rod's cast is not a pick-up, a bait onto the rod is not a bite of it)
    const heldSec = targetE ? false : this.secondary;
    const heldSecWas = targetE ? false : this.secondaryWas;
    const took = hu && hi ? heldCall(0, () => hu.buttons(hi, this.sel, { use: this.primary, useEdge: this.primaryEdge, take: heldSec, takeEdge: heldSec && !heldSecWas, aimed: !!this.target, side: keys.right, drop: keys.drop, pointerX: this.pointerX }, dt)) : 0;
    this.pointerX = 0;
    // (a button pressed where what it would do cannot be done: why, for a moment — not of a button the thing in the hands took)
    if (this.primaryEdge && !(took & 1)) this.sayWhy('LMB');
    if (keys.take && !this.rightWas && !(took & 2)) this.sayWhy('E');
    this.rightWas = keys.take;
    this.stepWhy(dt, keys.take);
    const p = this.primary;
    const s = this.secondary;
    const sw = this.secondaryWas;
    if (took & 1) {
      this.primary = false;
      this.primaryEdge = false;
    }
    if (took & 2) {
      this.secondary = false;
      this.secondaryWas = false;
    }
    this.act(dt, keys.drop && !(took & 4));
    this.primary = p;
    this.secondary = s;
    this.secondaryWas = sw;
    this.ghosts.update(dt);
    this.primaryEdge = false;
    this.ui();
  }

  // ------------------------------------------------------------------ what is under the mark

  private near(maxD: number): ModVehicle[] {
    const out: ModVehicle[] = [];
    for (const v of this.host.vehicles) {
      const d = Math.hypot(v.sim.px - this.walker.x, v.sim.pz - this.walker.z);
      if (d < maxD + v.sim.spec.body.halfLength) out.push(v);
    }
    return out;
  }

  private readonly aimPts = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly boxes = [new THREE.Box3(), new THREE.Box3()];

  /** where a mount's ghost is aimed at (world): its node; an axle's part (docs/MODCAR.md §22), either of its ends */
  private aimPoints(v: ModVehicle, mount: MountDef): THREE.Vector3[] {
    const n = v.view.mountNode(mount.id);
    if (!n) return [];
    n.updateWorldMatrix(true, false);
    const o = this.host.origin;
    const out = mount.pair !== undefined ? this.aimPts : [this.aimPts[0]];
    for (let i = 0; i < out.length; i++) {
      out[i].set(0, 0, mount.pair !== undefined ? (i === 0 ? -mount.pair : mount.pair) : 0);
      n.localToWorld(out[i]);
      out[i].x += o.x;
      out[i].y += o.y;
      out[i].z += o.z;
    }
    return out;
  }

  /** world position of a mount's node (or of what is on it) */
  private mountWorld(v: ModVehicle, mount: MountDef, out: THREE.Vector3): THREE.Vector3 | null {
    const n = v.view.mountNode(mount.id);
    if (!n) return null;
    n.updateWorldMatrix(true, false);
    n.getWorldPosition(out);
    const o = this.host.origin;
    out.x += o.x;
    out.y += o.y;
    out.z += o.z;
    return out;
  }

  /** the doors and lids of the vehicles near under the mark (they open and shut with things in the hands too) */
  private panels(better: (t: Target) => void, extra = 0): void {
    for (const v of this.near(REACH + 1)) {
      for (const m of v.view.frame.mounts) {
        if (!v.build.parts[m.id] || !v.view.hasPanel(m.id)) continue;
        const b = v.view.boundsOf(m.id, this.box);
        if (!b) continue;
        const p = this.ray.intersectBox(b, this.hit);
        if (!p) continue;
        const d = p.distanceTo(this.ray.origin);
        if (d <= REACH) better({ kind: 'part', v, mount: m, dist: d + extra, at: d });
      }
    }
  }

  /** the hand's reach now (m): Nomad Drive's, 1.6 looking level, longer looking down or up, 3.36 from 80°; a hold under way keeps the longest it had */
  private reachNow(): number {
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.dir.y)));
    const k = Math.min(1, Math.abs(pitch) / ((80 * Math.PI) / 180));
    const r = REACH_LEVEL + (REACH_STEEP - REACH_LEVEL) * k * k * (3 - 2 * k);
    const holding = this.primary && (this.progress > 0 || !!this.pendingTap);
    this.holdReach = holding ? Math.max(this.holdReach, r) : r;
    return this.holdReach;
  }

  private holdReach = REACH_LEVEL;

  /**
   * Which front seat a press lets one into (the player's ask, 2026-11-26: standing at the back of a camper to open its
   * door or its boot sat one in the driver's seat): the driver's only with the walker beside it (SEAT_NEAR on the plan)
   * and the mark on it, on its wheel, or on the vehicle's skin round it (`hit`, render space: within SEAT_HIT of it);
   * the passenger's the same by its own. A seat behind them, the back, a rear door: none. From the passenger's seat to
   * the driver's is the cab's own (cockpit.ts aimedSeat).
   */
  private seatFor(v: ModVehicle, mount: MountDef | null, hit: THREE.Vector3 | null): 'driver' | 'pass' | null {
    const o = this.host.origin;
    const d = v.view.frame.mounts.find((m) => m.driver) ?? null;
    const p = passengerSeat(v);
    const near = (m: MountDef | null, reach: number): boolean => {
      if (!m) return false;
      const n = v.view.mountNode(m.id);
      if (!n) return false;
      n.getWorldPosition(this.v3);
      if (Math.hypot(this.v3.x + o.x - this.walker.x, this.v3.z + o.z - this.walker.z) > SEAT_NEAR) return false;
      return !hit || Math.hypot(this.v3.x - hit.x, this.v3.z - hit.z) <= reach;
    };
    if (mount) {
      if ((mount === d || mount.cat === 'steering') && near(d, Infinity)) return 'driver';
      if (mount === p && near(p, Infinity)) return 'pass';
      return null;
    }
    if (near(d, SEAT_HIT)) return 'driver';
    if (near(p, SEAT_HIT)) return 'pass';
    return null;
  }

  private readonly v3b = new THREE.Vector3();

  /** how far the walker stands from a vehicle's footprint (m, on the plan): 0 against it */
  private offVehicle(v: ModVehicle): number {
    const sd = v.solid.update();
    const dx = this.walker.x - sd.x;
    const dz = this.walker.z - sd.z;
    const c = Math.cos(-sd.yaw);
    const s = Math.sin(-sd.yaw);
    const lx = Math.abs(dx * c - dz * s) - sd.hx;
    const lz = Math.abs(dx * s + dz * c) - sd.hz;
    return Math.hypot(Math.max(0, lx), Math.max(0, lz));
  }

  private pick(): Target | null {
    const o = this.host.origin;
    this.ray.origin.set(this.eye.x - o.x, this.eye.y - o.y, this.eye.z - o.z);
    this.ray.direction.set(this.dir.x, this.dir.y, this.dir.z).normalize();
    const held = this.held;
    const reach = this.reachNow();
    const liquid = held?.kind === 'tool' ? liquidOf(held.tool) : null;
    const cleaning = held?.kind === 'tool' && !!cleanerOf(held.tool);
    const spraying = held?.kind === 'tool' && held.tool.kind === 'spray';

    // ---- the vehicles: what of them the ray meets first, from their real meshes (no boxes round them)
    let surf: { v: ModVehicle; owner: string; dist: number; mesh: THREE.Mesh } | null = null;
    for (const v of this.near(TOOL_REACH + 1)) {
      const h = v.view.targetCast(this.ray.origin, this.ray.direction, TOOL_REACH + 0.6);
      if (h && (!surf || h.dist < surf.dist)) surf = { v, owner: h.owner, dist: h.dist, mesh: h.mesh };
    }
    const surfMount = (s: { v: ModVehicle; owner: string }): MountDef | null => {
      const id = s.v.view.mountOfOwner(s.owner);
      const m = id ? s.v.view.frame.mounts.find((mm) => mm.id === id) : undefined;
      return m && s.v.build.parts[m.id] ? m : null;
    };

    // ---- the things: lying about, the systems' devices, tanks, fillers, doorways (each by its own measure, and
    // where the ray meets it: at)
    let best: Target | null = null;
    const better = (t: Target): void => {
      if (!best || t.dist < best.dist) best = t;
    };
    // a tyre onto a rim lying about, a turbo onto an engine lying about
    if (held?.kind === 'part') {
      const sub = subOf(held.inst);
      if (sub) {
        const takes = (l: Loose): boolean => !!l.part && !l.part.sub[sub] && (sub === 'tire' ? !!partDef(l.part.part).rim?.tire : !!partDef(l.part.part).engine?.turbo);
        const r = this.host.loose.pick(this.eye, this.dir, reach, takes);
        if (r) better({ kind: 'looseSub', loose: r.loose, sub, dist: r.dist, at: r.dist });
      }
    }
    // things lying about: picked up into a free slot (with something in the hands too); with no slot free,
    // those that the stacks and the baskets in the hands have room for
    const free = this.freeSlot() >= 0;
    if (free || this.handsTakeIn()) {
      const r = this.host.loose.pick(this.eye, this.dir, reach, free ? undefined : this.takesLoose);
      if (r) {
        // (the mark is on it, its card is about to be drawn: a thing that turned while it lay there is what it turned into)
        const it = r.loose.item;
        if (it && (it.fresh !== undefined || it.inside)) settleThing(it, itemNow(), false);
        better({ kind: 'loose', loose: r.loose, dist: r.dist, at: r.dist });
      }
    }
    // the fillers: a can lines up with the one its liquid goes into; empty hands open and shut the flap
    // (a thing that holds water lines up with the radiator's as the radiator's bottle does)
    const fills: LiquidKind | null = liquid ?? (held?.kind === 'item' && (held.item.litres ?? 0) > 0 && waterCanOf(held.item) ? 'water' : null);
    for (const v of this.near(reach + 1)) {
      if (fills) {
        const fd = v.view.fillerHit(fills, this.ray, reach + 0.3);
        if (fd !== null) better({ kind: 'filler', v, liquid: fills, open: v.view.fillerOpen(fills), dist: Math.max(0, fd - 1), at: fd });
      } else if (!held && v.view.hasFlap) {
        const fd = v.view.fillerHit('fuel', this.ray, reach + 0.3);
        if (fd !== null) better({ kind: 'cap', v, dist: Math.max(0, fd - 0.3), at: fd });
      }
    }
    // the tanks that are not vehicles': a jerrycan lines up with an open one, empty hands open and shut the cap
    if (liquid === 'fuel' || !held) {
      for (const port of this.host.tanks) {
        // (a pump is a tank only to a jerrycan: empty hands work it as a device, by the vehicle parked at it)
        if (port.pump && liquid !== 'fuel') continue;
        const d = port.hit(this.ray, reach + 0.3);
        if (d !== null) better({ kind: 'tank', port, dist: Math.max(0, d - (liquid ? 1 : 0.3)), at: d });
      }
    }
    // garage devices, and the devices the V3 systems put in the world near where one stands
    for (const dv of this.host.devices) this.markDevice(dv, better, false, reach);
    const sources = this.host.interact;
    if (sources && !sources.empty) {
      const near = this.nearDevices;
      // (emptied by popping: a list cut to nothing with `length = 0` lets go of its store, and the next push allocates a new one)
      while (near.length > 0) near.pop();
      // (the eye itself is handed over, not its two coordinates: kernel/interact.ts says why)
      sources.near(this.eye, reach + 0.5, near);
      for (let i = 0; i < near.length; i++) {
        // (a system's device is its own code: one whose shape throws is reported and passed over, and the frame goes on)
        try {
          this.markDevice(near[i], better, true, reach);
        } catch (e) {
          sources.fault(near[i], 'hit', e);
        }
      }
      while (near.length > 0) near.pop();
    }
    const thing = best as Target | null;
    let thingAt = thing ? (thing.at ?? thing.dist) : Infinity;
    // (a thing behind what of a vehicle the ray meets first is hidden by it: not reached — Nomad Drive's obstacle ray)
    // (a vehicle's own filler and flap: its skin round them is not in their way)
    const own = thing && (thing.kind === 'filler' || thing.kind === 'cap') && surf && thing.v === surf.v;
    let chosen: Target | null = thing && (own || !(surf && thingAt > surf.dist + 0.03)) ? thing : null;
    if (!chosen) thingAt = Infinity;

    // ---- holding a part: the ghost the mark is on (or, behind a shut lid, the lid: open it first)
    if (held?.kind === 'part') {
      // (first the hologram one sees — the one drawn — met anywhere over its box; then any other by its own meshes)
      const shown = this.ghosts.castShown(this.ray.origin, this.ray.direction, reach + 0.5, GHOST_PAD);
      const g = shown ?? this.ghosts.cast(this.ray.origin, this.ray.direction, reach + 0.5);
      const spec = g ? this.ghostInfo.get(g.key) : undefined;
      // (its place under a shut bonnet or boot lid: the mark on it is on that lid — the button opens it — whether or
      // not the ray met the lid on its way: a lower eye looks in under a bonnet's front edge)
      const lidId = g && spec ? spec.v.view.shutOver(spec.mount.id) : null;
      const lid = lidId && spec ? spec.v.view.frame.mounts.find((m) => m.id === lidId && !!spec.v.build.parts[m.id]) : undefined;
      if (g && spec && lid && g.dist <= thingAt + 0.005) chosen = { kind: 'part', v: spec.v, mount: lid, dist: g.dist };
      else if (g && spec && shown) {
        // (the drawn one is seen, so the vehicle's skin round it — a door's frame, a sill, a pillar — does not hide it:
        // only a door shut in front of it is what the button opens first)
        const over = surf && surf.v === spec.v && surf.dist < shown.mid - 0.02 ? surfMount(surf) : null;
        const shut = !!over && over.id !== spec.mount.id && spec.v.view.hasPanel(over.id) && spec.v.view.panelOpen(over.id) < 0.5;
        if (g.dist <= thingAt + 0.005) chosen = shut ? { kind: 'part', v: spec.v, mount: over!, dist: surf!.dist } : { kind: 'ghost', v: spec.v, mount: spec.mount, sub: spec.sub, replace: spec.replace, dist: g.dist };
      } else if (g && spec && g.dist <= thingAt + 0.005) {
        const over = surf && surf.v === spec.v && surf.dist < g.dist - 0.02 ? surfMount(surf) : null;
        if (surf && surf.dist < g.dist - 0.02 && surf.v === spec.v && over?.id !== spec.mount.id) {
          // (the vehicle's own skin in front of it: a lid over it is what the button opens; anything else hides it)
          if (over && spec.v.view.hasPanel(over.id)) chosen = { kind: 'part', v: spec.v, mount: over, dist: surf.dist };
        } else chosen = { kind: 'ghost', v: spec.v, mount: spec.mount, sub: spec.sub, replace: spec.replace, dist: g.dist };
      }
      // (the mark on a fitted part it could take the place of: that place, to swap — its own ghost shows there)
      if (chosen?.kind !== 'ghost' && surf && surf.dist <= reach + 0.3) {
        const m = surfMount(surf);
        if (m) {
          for (const info of this.ghostInfo.values()) {
            if (info.v !== surf.v || info.mount.id !== m.id || !info.replace) continue;
            chosen = { kind: 'ghost', v: info.v, mount: info.mount, sub: info.sub, replace: true, dist: surf.dist };
            break;
          }
        }
      }
    }

    // ---- a vehicle's own surface: a part fitted (empty hands: open it, sit in it, take it off), the body (get in),
    // a door or a lid (opened and shut with most things in the hands — not under a cleaning tool or a can's nozzle)
    if (surf && surf.dist <= reach && !moving(surf.v) && (!chosen || surf.dist < thingAt - 0.005) && chosen?.kind !== 'ghost') {
      const m = surfMount(surf);
      const v = surf.v;
      let t: Target | null = null;
      if (!held) {
        // (the body's skin over a part under the car — its tank, its gearbox, its exhaust: that part, a hand behind it)
        const under = m ? null : this.underSkin(v, surf.dist, reach);
        if (m) t = { kind: 'part', v, mount: m, dist: surf.dist, seatIntent: m.cat === 'seat' ? v.view.seatSubHit(m.id, surf.mesh) : undefined };
        else if (under) t = { kind: 'part', v, mount: under, dist: surf.dist };
        // (a trailer has no seat to get into: towed, not driven; a motorcycle on a rack is carried, not ridden; nor is a
        // vehicle got into from up on its roof)
        else if (this.aboard?.v !== v && !v.view.frame.towed && !v.carriedBy && this.onRoof !== v) {
          const seat = this.seatFor(v, null, this.v3b.copy(this.ray.direction).multiplyScalar(surf.dist).add(this.ray.origin));
          t = seat ? { kind: 'enter', v, seat, dist: surf.dist } : { kind: 'body', v, dist: surf.dist };
        }
      } else if (!cleaning && !spraying) {
        if (m && (v.view.hasPanel(m.id) || this.hands.some((u) => u.aimsParts?.(held) && u.claims(held)))) t = { kind: 'part', v, mount: m, dist: surf.dist };
        else if (liquid) t = { kind: 'pour', v, dist: surf.dist };
      }
      if (t) chosen = t;
    }

    // ---- a tool's own work: where the ray meets a surface it works on, when nothing the hands could take is nearer
    this.paintAim = null;
    this.scrubAim = null;
    const chosenAt = chosen ? (chosen.at ?? chosen.dist) : Infinity;
    // (the same part lying about the tool is on: the tool's work there wins over picking it up)
    const chosenLoose = chosen && (chosen.kind === 'loose' || chosen.kind === 'looseSub') ? chosen.loose : null;
    if (spraying) {
      const a = this.host.paintCast(this.sv1.copy(this.ray.origin), this.sv2.copy(this.ray.direction), TOOL_REACH);
      this.paintAim = a;
      if (a?.paintable && !(a.v && moving(a.v)) && (a.dist < chosenAt - 0.005 || (!!a.loose && a.loose === chosenLoose))) {
        this.lookVehicle = a.v;
        chosen = { kind: 'paint', aim: a, dist: a.dist };
      }
    }
    if (cleaning) {
      const s = this.host.grimeCast(this.sv1.copy(this.ray.origin), this.sv2.copy(this.ray.direction), TOOL_REACH);
      // (a part lying about with nothing on it to clean: the hands pick it up as ever)
      const bare = s?.loose && s.inst ? s.inst.dirt + (s.inst.crust ?? 0) + s.inst.rust < 0.02 : false;
      if (s && !bare && !(s.v && moving(s.v)) && (s.dist < chosenAt - 0.005 || (!!s.loose && s.loose === chosenLoose))) {
        this.scrubAim = s;
        chosen = null;
      }
    }

    // ---- the vehicle looked at (Q packs the thing in the hands into it)
    let lookAt: ModVehicle | null = null;
    let lookD = Infinity;
    for (const v of this.near(REACH + 1)) {
      const d = this.bodyDist(v);
      if (d === null || d > REACH + 0.4 || d >= lookD) continue;
      lookAt = v;
      lookD = d;
    }
    if (!spraying || !this.lookVehicle) this.lookVehicle = lookAt;
    return this.steady(chosen);
  }

  /** a part under the car — its tank, its gearbox, its exhaust — the ray meets within 0.6 m behind the body's skin it met at `at` (null: none) */
  private underSkin(v: ModVehicle, at: number, reach: number): MountDef | null {
    const o = this.sv1.copy(this.ray.origin).addScaledVector(this.ray.direction, at + 0.005);
    const h = v.view.targetCast(o, this.ray.direction, Math.min(0.6, reach + 0.6 - at));
    const id = h ? v.view.mountOfOwner(h.owner) : null;
    const m = id ? v.view.frame.mounts.find((mm) => mm.id === id) : undefined;
    return m && v.build.parts[m.id] && UNDER_CATS.has(m.cat) ? m : null;
  }

  /** the last target as the mark stays on it: a new one only after two frames running, a hold's a moment after slipping off */
  private steadyKey = '';
  private steadyN = 0;
  private steadyHeld: Held = null;
  private graceT = 0;

  /** is a target from the frame before still there to be the target (not taken up, not gone, not out of reach) */
  private stillThere(t: Target): boolean {
    if (t.dist > this.holdReach + 0.6) return false;
    switch (t.kind) {
      case 'loose':
      case 'looseSub':
        return this.host.loose.list.includes(t.loose) && !t.loose.shut;
      case 'part':
        return !!t.v.build.parts[t.mount.id] && this.host.vehicles.includes(t.v);
      case 'ghost':
        return this.ghostInfo.has(`${t.v.build.uid}:${t.mount.id}:${t.sub ? `${t.sub}:` : ''}${this.held?.kind === 'part' ? this.held.inst.part : ''}`) && this.held?.kind === 'part';
      case 'device':
        return true;
      default:
        return this.host.vehicles.some((v) => 'v' in t && t.v === v) || !('v' in t);
    }
  }

  /**
   * The target settled (docs/V3/plan/hands.md §二.1): the same as before, kept; from one thing to another, only once
   * the new one has been under the mark two frames running; the button held on one (a hold under way, a press
   * waiting) and the mark slipping off onto nothing, kept 0.2 s.
   */
  private steady(t: Target | null): Target | null {
    // (the hands hold something else now: no settling — what the mark is on for that, at once)
    const heldNow = this.held ?? null;
    if (heldNow !== this.steadyHeld) {
      this.steadyHeld = heldNow;
      this.steadyN = 0;
      this.graceT = 0;
      return t;
    }
    const prev = this.target;
    const pk = this.keyOf(prev);
    const nk = this.keyOf(t);
    if (pk === nk) {
      this.steadyN = 0;
      this.graceT = 0;
      return t;
    }
    if (!t && prev && (this.primary || this.secondary) && (this.progress > 0 || !!this.pendingTap) && this.graceT < ND_HOLD_S.grace && this.stillThere(prev)) {
      this.graceT += this.frameDt;
      return prev;
    }
    this.graceT = 0;
    if (t && prev && this.stillThere(prev)) {
      if (this.steadyKey === nk) {
        if (++this.steadyN >= 2) {
          this.steadyN = 0;
          return t;
        }
      } else {
        this.steadyKey = nk;
        this.steadyN = 1;
      }
      return prev;
    }
    this.steadyN = 0;
    return t;
  }

  /** the frame's dt (for the hold's moment of grace) */
  private frameDt = 1 / 60;

  /** the ghosts shown last frame, by their keys: what each stands for */
  private readonly ghostInfo = new Map<string, { v: ModVehicle; mount: MountDef; sub: string | null; replace: boolean; empty: boolean; node: THREE.Object3D }>();

  /** the systems' devices near, asked for every frame into the one list */
  private readonly nearDevices: GarageDevice[] = [];

  /**
   * A device offered as what the mark is on, when the mark is on it (its own shape, or its point within its
   * radius). own: it is one of a V3 system's, and the target says so.
   */
  private markDevice(dv: GarageDevice, better: (t: Target) => void, own = false, reach = REACH): void {
    // (one with a shape of its own: a cupboard's box, a pump's)
    if (dv.hit) {
      const d = dv.hit(this.ray, reach + 0.3);
      if (d !== null) better(own ? { kind: 'device', device: dv, dist: d, own } : { kind: 'device', device: dv, dist: d });
      return;
    }
    const dx = dv.x - this.eye.x;
    const dy = dv.y - this.eye.y;
    const dz = dv.z - this.eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > reach + 0.5) return;
    const along = (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / d;
    // (where the ray passes its point: nearer than its middle by its radius, as a box's face would be)
    if (Math.sqrt(Math.max(0, 1 - along * along)) * d < dv.radius) better(own ? { kind: 'device', device: dv, dist: d, own, at: Math.max(0, d - dv.radius * 0.7) } : { kind: 'device', device: dv, dist: d, at: Math.max(0, d - dv.radius * 0.7) });
  }

  /** of the panels a zone is reached through, the one nearest the eye */
  private nearestVia(v: ModVehicle, zone: CargoZone): MountDef | null {
    let best: MountDef | null = null;
    let bd = Infinity;
    for (const id of zone.via ?? []) {
      const m = v.view.frame.mounts.find((mm) => mm.id === id);
      const b = m ? v.view.boundsOf(m.id, this.box) : null;
      if (!m || !b) continue;
      const c = b.getCenter(this.v3);
      const o = this.host.origin;
      const d = Math.hypot(c.x + o.x - this.eye.x, c.y + o.y - this.eye.y, c.z + o.z - this.eye.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  /** how far along the line of sight it meets a vehicle's body box (null: it misses) */
  private bodyDist(v: ModVehicle): number | null {
    const o = this.host.origin;
    const sd = v.solid.update();
    // (a rack or a panel on the roof stands over the body's box: the vehicle is looked at over it too — its roof rack a
    // place for things one looks at from beside it)
    const y1 = sd.y1 + (v.build.parts.roof ? 0.3 : 0);
    const c = this.v3.set(sd.x - o.x, (sd.y0 + y1) / 2 - o.y, sd.z - o.z);
    // the body box, turned to the vehicle's heading: test in its own frame
    const cos = Math.cos(-sd.yaw);
    const sin = Math.sin(-sd.yaw);
    const ox = this.ray.origin.x - c.x;
    const oz = this.ray.origin.z - c.z;
    const lo = this.lo.set(ox * cos - oz * sin, this.ray.origin.y - c.y, ox * sin + oz * cos);
    const ld = this.ld.set(this.ray.direction.x * cos - this.ray.direction.z * sin, this.ray.direction.y, this.ray.direction.x * sin + this.ray.direction.z * cos);
    this.hb.min.set(-sd.hx, -(y1 - sd.y0) / 2, -sd.hz);
    this.hb.max.set(sd.hx, (y1 - sd.y0) / 2, sd.hz);
    const hp = this.bodyRay.set(lo, ld).intersectBox(this.hb, this.hit);
    return hp ? hp.distanceTo(lo) : null;
  }

  private readonly lo = new THREE.Vector3();
  private readonly ld = new THREE.Vector3();
  private readonly hb = new THREE.Box3();
  private readonly bodyRay = new THREE.Ray();

  // ------------------------------------------------------------------ highlights

  private litVehicle: ModVehicle | null = null;

  /** the part about to come off (or be sprayed, washed) and the thing about to be picked up light up */
  private showHighlight(): void {
    const t = this.target;
    // (a part about to be sprayed or washed is not lit: one sees its real colour and the paint go on)
    const v = t?.kind === 'part' ? t.v : null;
    const mount = t?.kind === 'part' ? t.mount.id : null;
    if (this.litVehicle && this.litVehicle !== v) this.litVehicle.view.highlight(null);
    this.litVehicle = v;
    if (v) v.view.highlight(mount);
    const loose = t?.kind === 'loose' || t?.kind === 'looseSub' ? t.loose : t?.kind === 'device' ? (t.device.loose ?? null) : null;
    this.host.loose.highlight(loose, t?.kind === 'device' ? (t.device.lights ?? '') : '');
    if (v && mount) {
      const isSeat = t?.kind === 'part' && t.mount.cat === 'seat';
      const detachingSeat = isSeat && (t.seatIntent === 'detach' || (this.progress > 0 && (this.secondary || this.primary)));
      const mode: 'full' | 'cushion' = isSeat && !detachingSeat ? 'cushion' : 'full';
      this.outlineTarget = v.view.outlineTarget?.(mount, mode) ?? null;
    } else if (t?.kind === 'enter') {
      const sm = seatMount(t.v, t.seat);
      this.outlineTarget = sm ? (t.v.view.outlineTarget?.(sm.id, 'cushion') ?? null) : null;
    } else if (t?.kind === 'device') this.outlineTarget = this.host.loose.outlineTarget?.(t.device.loose ?? null, t.device.outline ?? null) ?? null;
    else if (loose) this.outlineTarget = this.host.loose.outlineTarget?.(loose) ?? null;
    else this.outlineTarget = null;
  }

  /** nothing lit (getting in, the walker gone) */
  clearHighlight(): void {
    this.litVehicle?.view.highlight(null);
    this.litVehicle = null;
    this.host.loose.highlight(null);
    this.outlineTarget = null;
  }

  // ------------------------------------------------------------------ ghosts

  private ghostTick = 0;
  private ghostHeld: Held = null;

  /** lookup a currently tracked vehicle mount ghost by key (for R-placement magnetic slot bridge) */
  ghostSlot(key: string): { v: ModVehicle; mount: MountDef; sub: string | null; empty: boolean; node: THREE.Object3D } | null {
    return this.ghostInfo.get(key) ?? null;
  }

  /** install the currently held part into a compatible empty mount directly from R placement mode */
  installFromPlace(v: ModVehicle, mount: MountDef, sub: string | null): boolean {
    const h = this.held;
    if (h?.kind !== 'part') return false;
    if (moving(v) || v.view.shutOver(mount.id)) return false;
    this.fit(v, mount, sub, h.inst);
    return true;
  }

  private showGhosts(): void {
    const held = this.held;
    if (held?.kind !== 'part' || !this.showGhostsOn) {
      if (this.ghostHeld !== null || this.ghostInfo.size > 0) {
        this.ghosts.clear();
        this.ghostInfo.clear();
        this.ghostHeld = null;
        this.ghostTick = 0;
      }
      this.ghosts.selected = '';
      this.ghosts.only = '';
      return;
    }
    const def = partDef(held.inst.part);
    const sub = subOf(held.inst);
    this.ghostTick -= this.frameDt;
    if (held !== this.ghostHeld || this.ghostTick <= 0) {
      this.ghostHeld = held;
      this.ghostTick = GHOST_TICK_S;
      this.ghostInfo.clear();
      const list: GhostSpec[] = [];
      for (const v of this.near(GHOST_NEAR + 4)) {
        if (this.offVehicle(v) > GHOST_NEAR) continue;
        const frame = v.view.frame;
        const blocked = moving(v);
        if (sub) {
          for (const m of frame.mounts) {
            if (v.view.shutOver(m.id)) continue;
            const inst = v.build.parts[m.id];
            if (!inst || !subMountsOf(partDef(inst.part)).includes(sub)) continue;
            const holder = v.view.nodeOf(m.id);
            if (!holder) continue;
            // on the part's own node (already mirrored with it): a turbo at the engine's M_turbo, a tyre round the rim
            const node = sub === 'turbo' ? (holder.getObjectByName('M_turbo') ?? holder) : holder;
            const kind = blocked ? 'blocked' : inst.sub[sub] ? 'replace' : 'empty';
            const key = `${v.build.uid}:${m.id}:${sub}:${def.id}`;
            list.push({ node, mount: null, partId: def.id, variant: sub === 'tire' ? inst.part : '', kind, key });
            this.ghostInfo.set(key, { v, mount: m, sub, replace: !!inst.sub[sub], empty: kind === 'empty', node });
          }
          continue;
        }
        for (const m of mountsFor(frame, def)) {
          // Under-hood / shut-lid slots stay hidden until the bonnet or lid is open or removed.
          if (v.view.shutOver(m.id)) continue;
          const shape = def.panel ? v.view.panelShape(m.id) : null;
          const node = shape?.node ?? v.view.mountNode(m.id);
          if (!node) continue;
          const kind = blocked ? 'blocked' : v.build.parts[m.id] ? 'replace' : 'empty';
          const key = `${v.build.uid}:${m.id}:${def.id}`;
          list.push({ node, mount: shape ? null : m, partId: def.id, variant: frameVariant(def.id, v.view.frame), kind, key, make: shape?.make });
          this.ghostInfo.set(key, { v, mount: m, sub: null, replace: !!v.build.parts[m.id], empty: kind === 'empty', node });
        }
      }
      // Also light compatible bare loose rims (for tyres) and loose engines (for turbos) within 15 m.
      if (sub) {
        const ex = this.walker.x;
        const ez = this.walker.z;
        for (const l of this.host.loose.list) {
          if (l.shut || !l.part || l.part.sub[sub]) continue;
          const pd = partDef(l.part.part);
          if (sub === 'tire' ? !pd.rim?.tire : !pd.engine?.turbo) continue;
          if (Math.hypot(l.x - ex, l.z - ez) > GHOST_NEAR) continue;
          const node = sub === 'turbo' ? (l.obj.getObjectByName('M_turbo') ?? l.obj) : l.obj;
          const key = `loose:${l.uid}:${sub}:${def.id}`;
          list.push({ node, mount: null, partId: def.id, variant: sub === 'tire' ? l.part.part : '', kind: 'empty', key });
        }
      }
      this.ghosts.show(list);
    }
    const t = this.target;
    const aimed =
      t?.kind === 'ghost'
        ? `${t.v.build.uid}:${t.mount.id}:${t.sub ? `${t.sub}:` : ''}${def.id}`
        : t?.kind === 'looseSub'
          ? `loose:${t.loose.uid}:${t.sub}:${def.id}`
          : '';
    this.ghosts.selected = aimed;
    // All compatible empty slots within 15 m stay lit simultaneously (no single-ghost hiding).
    this.ghosts.only = '';
  }

  /** how many things lie on a fitted part (a seat's cushion): things riding in the vehicle in its box, or up to a hand above it */
  private thingsOn(v: ModVehicle, mount: MountDef): number {
    const b = v.view.boundsOf(mount.id, this.box);
    if (!b) return 0;
    const o = this.host.origin;
    let n = 0;
    for (const l of this.host.loose.list) {
      if (l.riding?.on !== v) continue;
      const x = l.x - o.x;
      const y = l.y + 0.02 - o.y;
      const z = l.z - o.z;
      if (x > b.min.x - 0.03 && x < b.max.x + 0.03 && z > b.min.z - 0.03 && z < b.max.z + 0.03 && y > b.min.y && y < b.max.y + 0.6) n++;
    }
    return n;
  }

  // ------------------------------------------------------------------ doing things

  private keyOf(t: Target | null): string {
    if (!t) return '';
    switch (t.kind) {
      case 'loose':
      case 'looseSub':
        return `${t.kind}:${t.loose.uid}`;
      case 'ghost':
        return `ghost:${t.v.build.uid}:${t.mount.id}:${t.sub ?? ''}`;
      case 'part':
        return `part:${t.v.build.uid}:${t.mount.id}`;
      case 'paint':
        return `paint:${t.aim.v?.build.uid ?? t.aim.loose?.uid ?? ''}:${t.aim.mount ?? (t.aim.v ? 'frame' : 'loose')}`;
      case 'filler':
        return `filler:${t.v.build.uid}:${t.liquid}`;
      case 'pour':
      case 'enter':
      case 'body':
      case 'cap':
        return `${t.kind}:${t.v.build.uid}`;
      case 'device':
        return `device:${t.device.id}`;
      case 'tank':
        return `tank:${t.port.id}`;
      case 'stow':
        return `stow:${t.aim.v.build.uid}:${t.aim.zone.id}`;
    }
  }

  /**
   * A thing lying about picked up (E on it; F held on an appliance): into a free slot, onto a stack or into a
   * basket in the hands; the part of a stack there is no room for lies where it was. False: no room for any of it.
   */
  takeLoose(l: Loose): boolean {
    const host = this.host;
    const h = heldOf(l);
    const all = h.kind === 'item' ? countOf(h.item) : 1;
    const kg = partMass(h);
    const left = this.receive(h);
    // (no room for any of it: it lies where it was)
    if (left >= all) return false;
    // into a slot of its own: that one is in the hands now, as a thing picked up always was (onto a stack or
    // into a basket: the hands stay as they are)
    const at = this.slots.indexOf(h);
    if (at >= 0) this.sel = at;
    const rode = l.riding?.on as ModVehicle | undefined;
    // only part of a stack went in: the rest lies where it was, the same thing with what is left of its count
    if (left <= 0) host.loose.remove(l);
    else host.loose.touch(l);
    // (taken out of a vehicle, all of it or some: what rides in the vehicle is weighed again)
    if (rode && host.vehicles.includes(rode)) host.cargoChanged(rode);
    host.sound('pickup', left > 0 ? (kg * (all - left)) / all : kg);
    // (what the mark was on is in the hands now)
    this.target = null;
    return true;
  }

  /** E pressed on a device: the thing in the hands given to it when it takes that, else the device used (one that wants E held: by the hold) */
  private pressDevice(dv: GarageDevice): void {
    const host = this.host;
    const take = this.held && dv.take ? dv.take(this.held) : null;
    if (take) {
      if (take.ok && dv.useWith) {
        const h = this.held!;
        // (kept: it stays in the hands, the device has had what it took of it)
        if (!take.keep) {
          this.held = null;
          this.target = null;
        }
        dv.useWith(h);
      } else this.flashWhy(take.word[host.ui.lang]);
      return;
    }
    // (one held down: holdDevice)
    if (!dv.holdS) dv.use();
  }

  /** how long the left button has been down on an appliance (s): let go before TAP_S it was a press, held to GRAB_S it is picked up */
  private grabT = 0;

  /** a press on something a hold also works, waiting for the button to come up (what it was on, how long so far) */
  private pendingTap: { key: string; t: number } | null = null;

  /** the button is down on what a hold works, but not yet for longer than a press (the hold's ring waits) */
  private tapWindow(): boolean {
    return !!this.pendingTap && this.pendingTap.t <= TAP_S;
  }

  /**
   * True when the aimed target has a primary LMB tap action of its own (Nomad Drive secondary-promotion rule):
   * functional parts (doors, hood, trunk, front seats), loose items, and non-hold devices keep primary on LMB
   * and secondary (detach / pick up appliance / detach sub-part) on Hold E 0.5 s.
   * Targets without a primary action (engine, wheels, battery, empty slots, etc.) promote secondary to LMB!
   */
  private targetHasPrimary(t: Target | null, held: Held): boolean {
    if (!t) return false;
    if (t.kind === 'part') {
      if (t.v.view.hasPanel(t.mount.id)) return true;
      if (!held && t.mount.cat === 'seat' && t.seatIntent === 'detach') return false;
      if (!held && (t.mount.cat === 'seat' || t.mount.cat === 'steering') && !!this.seatFor(t.v, t.mount, null)) return true;
      return false;
    }
    if (t.kind === 'loose') return true;
    if (t.kind === 'device') {
      const dv = t.device;
      if (held && dv.take?.(held)) return true;
      return !dv.holdS;
    }
    return false;
  }

  /** True when a device has an active primary LMB action right now (else a secondary grab promotes to LMB). */
  private deviceHasPrimary(dv: GarageDevice, held: Held): boolean {
    if (dv.holdS) return true;
    if (held && dv.take?.(held)) return true;
    if (dv.why) return false;
    return dv.word[this.host.ui.lang].length > 0;
  }

  /**
   * True when the aimed target claims E (secondary action on a functional target) so held-item E is withheld.
   */
  private targetClaimsE(t: Target | null, held: Held): boolean {
    if (!t) return false;
    if (t.kind === 'part') return !held && this.targetHasPrimary(t, held);
    if (t.kind === 'loose') return !held && !!subOff(t.loose);
    if (t.kind === 'device') {
      const dv = t.device;
      if (dv.holdS || (held && dv.take?.(held))) return false;
      if (!this.deviceHasPrimary(dv, held)) return false;
      const g = this.grabOf(dv);
      return !!g && dv.word[this.host.ui.lang] !== `拿起 <b>${g.name}</b>`;
    }
    return false;
  }

  /**
   * Under Nomad Drive's secondary-promotion rule, functional targets put secondary on Hold E (not LMB),
   * so LMB taps never need to wait for release.
   */
  private waitsForTap(_t: Target): boolean {
    return false;
  }

  /** the press that waited, done now the button is up */
  private tapNow(t: Target): void {
    const host = this.host;
    if (t.kind === 'loose') {
      this.takeLoose(t.loose);
      return;
    }
    if (t.kind === 'device') {
      if (t.own) {
        try {
          this.pressDevice(t.device);
        } catch (e) {
          host.interact?.fault(t.device, 'use', e);
        }
      } else this.pressDevice(t.device);
      return;
    }
    if (t.kind === 'part') {
      if (t.v.view.hasPanel(t.mount.id)) {
        const open = t.v.view.panelOpen(t.mount.id) < 0.5;
        t.v.view.setPanelOpen(t.mount.id, open);
        host.sound(open ? 'door_open' : 'door_close', 1, t.mount.id);
        host.panelOpened?.(t.v, t.mount.id, open);
        const rest = open ? null : t.v.view.lidRest(t.mount.id).part;
        if (rest) this.flashWhy(`盖不上：${partDef(rest).name[host.ui.lang]}太高`);
        return;
      }
      if (!this.held && (t.mount.cat === 'seat' || t.mount.cat === 'steering')) host.enter(t.v, t.mount === passengerSeat(t.v) ? 'pass' : 'driver');
    }
  }

  /** what a hold of the left button on a device would take up, and whether the hands have room (null: nothing) */
  private grabOf(dv: GarageDevice): { name: string; room: boolean } | null {
    if (dv.grabbable) {
      const own = dv.grabbable();
      return own ? { name: heldName(own), room: this.roomFor(own) > 0 } : null;
    }
    const l = dv.loose;
    if (!l) return null;
    const h = heldOf(l);
    return { name: heldName(h), room: this.roomFor(h) > 0 };
  }

  /**
   * Hold secondary (E when device has an active primary LMB action, else promoted to LMB) for 0.5 s to pick up
   * a grabbable device (an appliance or a vessel on a burner).
   */
  private grabDevice(dv: GarageDevice, held: Held, dt: number): boolean {
    if (dv.holdS || (held && dv.take?.(held)) || !this.grabOf(dv)) return false;
    const heldBtn = this.deviceHasPrimary(dv, held) ? this.secondary : this.primary;
    if (!heldBtn) {
      this.grabT = 0;
      return false;
    }
    if (this.spent) return true;
    this.grabT += dt;
    this.progress = Math.min(1, this.grabT / ND_HOLD_S.grab);
    if (this.grabT >= ND_HOLD_S.grab) {
      this.progress = 0;
      this.spent = true;
      this.grabT = 0;
      this.pendingTap = null;
      const took = dv.grab ? dv.grab() : !!dv.loose && this.takeLoose(dv.loose);
      if (!took) this.flashWhy('手满了');
    }
    return true;
  }

  private readonly aheadSolids: import('../../core/world/solids').Solid[] = [];
  private readonly aheadPush = new Push();

  private readonly aheadCars: ModVehicle[] = [];
  private readonly aheadB = new Float64Array(9);

  /**
   * How far one can reach straight ahead along the view before something solid (m, at most maxD): a wall or a
   * crate (the world's solids), or a vehicle's body (its box; not the one one is inside). The held thing keeps
   * this side of it (Infinity: nothing within maxD). Cast `below` under the eye: where the thing is carried (a door at the chest goes into a car
   * whose roof the eye looks over).
   */
  roomAhead(maxD: number, below = 0): number {
    const e = this.eye;
    const d = this.dir;
    const near = this.aheadSolids;
    near.length = 0;
    this.solids.solidsNear(e.x, e.z, maxD + 0.3, near);
    const cars = this.aheadCars;
    cars.length = 0;
    const inside = this.aboard?.v ?? null;
    for (const v of this.host.vehicles) {
      if (v === inside) continue;
      const s = v.sim;
      const dx = s.px - e.x;
      const dz = s.pz - e.z;
      if (dx * dx + dz * dz < (maxD + 4) * (maxD + 4)) cars.push(v);
    }
    if (!near.length && !cars.length) return Infinity;
    const b = this.aheadB;
    for (let t = 0.15; t <= maxD + 1e-9; t += 0.05) {
      const x = e.x + d.x * t;
      const y = e.y - below + d.y * t;
      const z = e.z + d.z * t;
      for (const s of near) {
        if (y < s.y0 || y > s.y1) continue;
        if (pushOut(s, x, z, 0.04, this.aheadPush)) return t;
      }
      for (const v of cars) {
        const s = v.sim;
        s.basis(b);
        const box = v.view.frame.body;
        // (the point in the vehicle's frame: forward, up, right from its base on the ground)
        const px = x - s.px;
        const py = y - (s.py - s.spec.cgHeight);
        const pz = z - s.pz;
        const f = px * b[0] + py * b[1] + pz * b[2];
        const u = px * b[3] + py * b[4] + pz * b[5];
        const r = px * b[6] + py * b[7] + pz * b[8];
        if (f >= box.rear - 0.04 && f <= box.front + 0.04 && Math.abs(r) <= box.halfWidth + 0.04 && u >= box.bottom && u <= box.top + 0.04) return t;
      }
    }
    return Infinity;
  }

  /** what puts down the thing in the hands just so (Nomad Drive's placing, nd-place): R; Q and E turn it, G its grid */
  placer: { toggle(): void; readonly placing: boolean; turnStep(dir: 1 | -1): void } | null = null;

  /**
   * What takes the thing in the hands into the piece of furniture the mark is on (nd-home, docs/V3/plan/finish.md
   * §十一 2): Q there — its line, and the doing (true: it took the press)
   */
  shelver: { word(t: Target | null): string | null; into(t: Target | null, held: Held): boolean } | null = null;

  /** Q: put down / toss held item (old Q-to-stow into vehicles and furniture removed 2026-11-27; use R placement) */
  drop(): boolean {
    if (!this.held || this.pin) return false;
    if (this.placer?.placing) {
      this.placer.toggle();
      return true;
    }
    return this.putDown();
  }

  /**
   * Nomad Drive Q tap toss / hold charge throw:
   *  - Items > 15 kg: tap puts down gently; holding to charge refuses with "太重了，无法投掷".
   *  - Items <= 15 kg: throws along view (+8° pitch) at 4 m/s (tap) to 14 m/s (full 1.2 s charge) via LooseThings.fling.
   */
  throwHeld(charge01: number): boolean {
    const held = this.held;
    if (!held || this.pin) return false;
    // Short-tap Q while aiming into an open cooler drops & stacks the item directly inside it.
    if (charge01 < 0.08 && this.shelver?.into(this.target, held)) {
      if (this.flow) this.endFlow();
      return true;
    }
    const kg = partMass(held);
    if (kg > THROW_MAX_KG) {
      if (charge01 > 0.08) {
        this.flashWhy('太重了，无法投掷');
        return false;
      }
      return this.putDown();
    }
    const c = Math.max(0, Math.min(1, charge01));
    const speed = THROW_MIN_MS + (THROW_MAX_MS - THROW_MIN_MS) * c;
    const pitch = Math.asin(Math.max(-1, Math.min(1, this.dir.y))) + THROW_UP_RAD;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const hy = Math.hypot(this.dir.x, this.dir.z);
    const fx = hy > 1e-4 ? this.dir.x / hy : Math.cos(this.walker.heading);
    const fz = hy > 1e-4 ? this.dir.z / hy : Math.sin(this.walker.heading);
    const ahead = Math.min(0.55, Math.max(0.25, this.roomAhead(0.65, 0.15) - 0.15));
    const x = this.eye.x + fx * ahead;
    const y = this.eye.y - 0.14;
    const z = this.eye.z + fz * ahead;
    if (this.flow) this.endFlow();
    const l =
      held.kind === 'part'
        ? this.host.loose.addPart(held.inst, x, y, z, this.walker.heading)
        : held.kind === 'item'
          ? this.host.loose.addItem(held.item, x, y, z, this.walker.heading)
          : this.host.loose.addTool(held.tool, x, y, z, this.walker.heading);
    this.host.loose.fling(l, { x: fx * cp * speed, y: sp * speed, z: fz * cp * speed });
    this.held = null;
    this.host.sound('putdown', Math.min(1, kg / 6));
    return true;
  }

  /** id of the GarageDevice currently running a hold-progress action, so finishing never chains into a reverse hold (#2) */
  private deviceHoldId = '';

  /** E held on a device that wants it held: its progress told, the device used when the hold is full; false: no hold on this device now */
  private holdDevice(dv: GarageDevice, held: Held, dt: number): boolean {
    if (!this.primary) this.deviceHoldId = '';
    if (!(dv.holdS && this.primary && !(held && dv.take?.(held)))) {
      if (this.primary && this.deviceHoldId === dv.id) {
        this.progress = 0;
        this.spent = true;
        this.deviceHoldId = '';
      }
      return false;
    }
    if (this.spent) return true;
    this.deviceHoldId = dv.id;
    this.progress += dt / dv.holdS;
    dv.holding?.(Math.min(1, this.progress));
    if (this.progress >= 1) {
      this.progress = 0;
      this.spent = true;
      this.deviceHoldId = '';
      dv.use();
    }
    return true;
  }

  /** a device's card, and among what the buttons would do, its line */
  private deviceWords(dv: GarageDevice, held: Held, acts: Action[]): ItemCard {
    const ui = this.host.ui;
    const card = deviceCard(dv);
    const take = held && dv.take ? dv.take(held) : null;
    if (take) acts.push(take.ok ? { keys: E, text: take.word[ui.lang] } : { keys: E, text: take.word[ui.lang], off: true, why: take.word[ui.lang] });
    else acts.push(dv.why ? { keys: E, hold: !!dv.holdS, text: dv.word[ui.lang], off: true, why: dv.why[ui.lang] } : { keys: E, hold: !!dv.holdS, text: dv.word[ui.lang] });
    // its second thing: the wheel (a flame turned up or down)
    const alt = dv.alt;
    if (alt) acts.push({ keys: ['Wheel'], text: alt.word[ui.lang] });
    // a thing lying there (an appliance or vessel): Hold E 0.5 s when device has an active LMB primary, else promoted to Hold LMB 0.5 s
    const g = this.grabOf(dv);
    const gKey = this.deviceHasPrimary(dv, held) ? F : E;
    // (… nor a second line for a device whose own press is the picking up: a piece of furniture's)
    if (g && !dv.holdS && !take && dv.word[ui.lang] !== `拿起 <b>${g.name}</b>`) acts.push(g.room ? { keys: gKey, hold: true, text: `拿起 <b>${g.name}</b>` } : { keys: gKey, hold: true, text: '拿起', off: true, why: '手满了' });
    return card;
  }

  /** the system's way with the thing in the hands now (HandsUse), null: the game's own */
  handsUse(): HandsUse | null {
    const h = this.held;
    if (!h || !this.hands.length) return null;
    for (const u of this.hands) if (u.claims(h)) return u;
    return null;
  }

  /** the hands' system told of this frame (E and RMB passed separately), and the last one told when the thing has left the hands */
  private stepHands(dt: number, e: boolean, rmb = false): void {
    const hu = this.handsUse();
    const was = this.handsWas;
    if (was && (was.use !== hu || was.held !== this.held)) {
      this.handsWas = null;
      was.use.gone?.(was.held);
    }
    if (!hu || !this.held) return;
    this.handsWas = { use: hu, held: this.held };
    if (hu.takesF?.(this.held)) this.secondary = this.secondaryWas = false;
    hu.step?.(this.held, dt, e, rmb);
  }

  /** what F does with the thing in the hands wherever one looks (a drink with something in it, food, a backpack): F is taken */
  private handsUseF(held: Held): boolean {
    const hu = this.handsUse();
    if (hu && held && hu.takesF?.(held)) return true;
    if (held?.kind !== 'item') return false;
    const d = itemDef(held.item.item);
    return (!!d.drink && (held.item.litres ?? 0) > 0.001) || !!d.eat || !!d.pack || !!heldUseOf(held.item)?.takesF;
  }

  private act(dt: number, dropKey: boolean): void {
    this.lastMoved = 0;
    if (!this.primary && !this.secondary) this.spent = false;
    const t = this.target;
    const key = this.keyOf(t);
    const host = this.host;
    // the liquid stops when the buttons are let go or the can is off the filler
    // (a thing that holds water: the left button pours it into a radiator; the right one is still to drink it)
    const flowing =
      ((t?.kind === 'filler' && t.open) || (t?.kind === 'tank' && t.port.open)) &&
      (this.held?.kind === 'tool' ? this.primary || this.secondary : this.held?.kind === 'item' && t?.kind === 'filler' && t.liquid === 'water' && this.primary && !!waterCanOf(this.held.item));
    if (!flowing && this.flow) this.endFlow();
    // (the pad's drop button, held: what is in the hands put down — the keyboard's Q is a press, drop())
    if (dropKey && this.held && !this.pin) {
      this.dropT += dt;
      if (this.dropT >= DROP_HOLD) {
        this.drop();
        this.dropT = -Infinity;
      }
      return;
    }
    if (!dropKey) this.dropT = 0;

    // a press that waited (a hold works the same thing otherwise): the button up soon enough, it was a press
    const pend = this.pendingTap;
    if (pend && !this.primary) {
      this.pendingTap = null;
      if (pend.key === key && pend.t <= TAP_S && t && !this.spent) {
        this.tapNow(t);
        return;
      }
    } else if (pend) pend.t += dt;

    // presses
    if (this.primaryEdge && t) {
      if (this.waitsForTap(t)) {
        this.pendingTap = { key, t: 0 };
        return;
      }
      if (t.kind === 'loose') {
        this.takeLoose(t.loose);
        return;
      }
      if (t.kind === 'enter' && !this.held) {
        host.enter(t.v, t.seat);
        return;
      }
      if (t.kind === 'part') {
        // a panel opens and shuts (with or without something in the hands); the driver's seat lets one in
        if (t.v.view.hasPanel(t.mount.id)) {
          const open = t.v.view.panelOpen(t.mount.id) < 0.5;
          t.v.view.setPanelOpen(t.mount.id, open);
          host.sound(open ? 'door_open' : 'door_close', 1, t.mount.id);
          host.panelOpened?.(t.v, t.mount.id, open);
          // shut onto something too tall for it: say so
          const rest = open ? null : t.v.view.lidRest(t.mount.id).part;
          if (rest) this.flashWhy(`盖不上：${partDef(rest).name[host.ui.lang]}太高`);
          return;
        }
        if (!this.held && (t.mount.cat === 'seat' || t.mount.cat === 'steering')) {
          // (the driver's seat or its wheel from beside it, the passenger's by its own; a seat behind lets no one in)
          const seat = this.seatFor(t.v, t.mount, null);
          if (seat) {
            host.enter(t.v, seat);
            return;
          }
        }
      }
      if (t.kind === 'device') {
        if (t.own) {
          // (a system's device: a press that throws is reported, and is over — the frame goes on)
          try {
            this.pressDevice(t.device);
          } catch (e) {
            host.interact?.fault(t.device, 'use', e);
          }
        } else this.pressDevice(t.device);
        return;
      }
      if (t.kind === 'tank' && !this.held) {
        t.port.open = !t.port.open;
        t.port.changed();
        host.sound('cap_open', 0.8);
        return;
      }
      if (t.kind === 'stow' && this.held) {
        const { v, zone, spot } = t.aim;
        if (!spot) return;
        const held = this.held;
        host.cargo.stow(v, zone, spot, held);
        this.held = null;
        this.target = null;
        host.sound('putdown', massOfHeld(held));
        return;
      }
      if (t.kind === 'cap' && !this.held) {
        t.v.view.capOpen = !t.v.view.capOpen;
        host.sound('latch', 0.7);
        return;
      }
    }

    // holds: fit, take off, pour, spray
    if (key !== this.progressKey) {
      this.progress = 0;
      this.progressKey = key;
    }
    const held = this.held;
    this.spraying = null;
    // the button down with an empty spray can: it only sputters
    this.sprayDry = false;
    if (this.primaryEdge && held?.kind === 'tool' && held.tool.kind === 'spray' && sprayLeft(held.tool) <= 0) {
      // (it sputters; the words say why: sayWhy)
      this.sprayDry = true;
    }
    const targetClaimsSec = this.targetClaimsE(t, held);
    // eating, drinking, taking medicine: E with it in the hands (withheld when aimed target claims E)
    if (this.use) {
      this.stepUse(dt);
      return;
    }
    if (held?.kind === 'item' && !targetClaimsSec) {
      const d = itemDef(held.item.item);
      const pressed = this.secondary && !this.secondaryWas;
      if (d.drink && this.secondary && (held.item.litres ?? 0) > 0.001) {
        this.use = { kind: 'drink', t: 0, slot: this.sel, item: held.item, dur: Infinity };
        if (!held.item.opened) {
          held.item.opened = true;
          const id = held.item.item;
          if (id !== 'nd_mug' && id !== 'coffee_pot' && id !== 'nd_bucket') {
            host.sound(d.model === 'drink_soda' || d.model === 'drink_energy' ? 'can_open' : 'cap_open');
          }
        }
        return;
      }
      if (d.eat && pressed) {
        const pill = d.cat === 'med';
        this.use = { kind: pill ? 'pill' : 'eat', t: 0, slot: this.sel, item: held.item, dur: d.eat.sec };
        this.bites = 0;
        host.sound(pill ? 'pills' : 'wrapper');
        return;
      }
    }
    // Hold E 0.5 s with clothing in the hands (withheld when aimed target claims E)
    if (held?.kind === 'item' && itemDef(held.item.item).wear && this.secondary && !targetClaimsSec) {
      if (this.spent) return;
      this.selectT += dt;
      this.progress = this.selectT / ND_HOLD_S.wear;
      if (this.progress >= 1) {
        this.progress = 0;
        this.selectT = 0;
        this.spent = true;
        if (this.wearClothes(held.item)) {
          host.sound('cloth');
          this.flashWhy('穿上了');
        }
      }
      return;
    }
    // Hold E 0.5 s with a backpack in the hands (withheld when aimed target claims E)
    if (held?.kind === 'item' && itemDef(held.item.item).pack && this.secondary && !targetClaimsSec) {
      if (this.spent) return;
      this.selectT += dt;
      this.progress = this.selectT / ND_HOLD_S.wear;
      if (this.progress >= 1) {
        this.progress = 0;
        this.selectT = 0;
        this.spent = true;
        const it = held.item;
        if (this.wearPack(it)) {
          host.sound('cloth');
          this.flashWhy('背上了');
        } else this.flashWhy('先空出多的格子');
      }
      return;
    }
    if (!t) return;
    if ((t.kind === 'ghost' || t.kind === 'looseSub') && held?.kind === 'part' && this.primary) {
      if (this.spent) return;
      if (t.kind === 'ghost' && (moving(t.v) || t.v.view.shutOver(t.mount.id))) {
        this.progress = 0;
        return;
      }
      const need = ND_HOLD_S.attach;
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        if (t.kind === 'ghost') this.fit(t.v, t.mount, t.sub, held.inst);
        else {
          fitSub(t.loose.part!, t.sub, held.inst);
          // redraw the loose wheel with its new tyre
          const l = t.loose;
          host.loose.remove(l);
          host.loose.addPart(l.part!, l.x, l.y, l.z, l.yaw).resting = true;
          this.held = null;
          host.sound('ratchet_done');
        }
      }
      return;
    }
    // Detach mounted part: Hold E 0.5 s on functional parts (doors, hood, trunk, seats),
    // or Hold LMB 0.5 s (promoted secondary) on non-functional mounted parts (engine, wheel, battery, etc.)
    const detachHeld = t.kind === 'part' && !held && (this.targetHasPrimary(t, held) ? this.secondary : this.primary);
    if (t.kind === 'part' && detachHeld) {
      if (this.spent) return;
      if (moving(t.v) || t.v.view.shutOver(t.mount.id)) {
        this.progress = 0;
        return;
      }
      if (t.mount.cat === 'seat' && this.thingsOn(t.v, t.mount) > 0) {
        this.progress = 0;
        this.spent = true;
        this.flashWhy('先拿走上面的东西');
        return;
      }
      this.progress += dt / ND_HOLD_S.detach;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        const inst = removePart(t.v.build, t.mount.id);
        if (inst) {
          this.held = { kind: 'part', inst };
          this.target = null;
          host.changed(t.v, `off:${t.mount.id}`);
          host.sound('remove_done', partDef(inst.part).mass);
        }
      }
      return;
    }
    const looseSub = t.kind === 'loose' && !held ? subOff(t.loose) : null;
    if (t.kind === 'loose' && looseSub && this.secondary) {
      if (this.spent) return;
      // Hold E 0.5 s: detach tyre off a loose wheel, or turbo off a loose engine (LMB tap picks the whole thing up)
      this.progress += dt / ND_HOLD_S.detach;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        const off = removeSub(t.loose.part!, looseSub);
        const l = t.loose;
        host.loose.remove(l);
        host.loose.addPart(l.part!, l.x, l.y, l.z, l.yaw).resting = true;
        if (off) {
          this.held = { kind: 'part', inst: off };
          host.sound('remove_done', partDef(off.part).mass);
        }
      }
      return;
    }
    if (t?.kind === 'device') {
      if (t.own) {
        // (a system's device: a hold that throws is reported, and is over until E is let go — the frame goes on)
        try {
          if (this.grabDevice(t.device, held, dt)) return;
          if (this.holdDevice(t.device, held, dt)) return;
        } catch (e) {
          host.interact?.fault(t.device, 'hold', e);
          this.progress = 0;
          this.spent = true;
          return;
        }
      } else if (this.grabDevice(t.device, held, dt) || this.holdDevice(t.device, held, dt)) return;
    } else this.grabT = 0;
    if (flowing && t.kind === 'tank' && held?.kind === 'tool') {
      if (key !== this.pourTargetKey) {
        this.pourTargetKey = key;
        this.pourOut = !t.port.pump && (held.tool.litres ?? 0) <= 0.01;
      }
      // (a filling station's pump fills the can; a regular tank pours/siphons based on Wheel-selected pourOut)
      const dir = t.port.pump ? 'out' : this.pourOut ? 'out' : 'in';
      if (this.flow && (this.flow.dir !== dir || this.flow.port !== t.port)) this.endFlow();
      this.flow ??= { dir, v: null, port: t.port, liquid: 'fuel', moved: 0, fuel: '' };
      const moved = dir === 'in' ? pourTank(held.tool, t.port.tank, dt) : siphonTank(held.tool, t.port.tank, t.port.pump ? dt * 2 : dt);
      if (t.port.pump && moved > 0) host.sound('pump_run');
      this.lastMoved = moved;
      if (moved > 0) {
        this.flow.moved += moved;
        this.flow.fuel = FUEL_ZH[held.tool.fuel ?? 'petrol'];
        t.port.changed();
        host.sound('pour', moved);
      }
      return;
    }
    const can = flowing && t.kind === 'filler' ? (held?.kind === 'tool' ? held.tool : held?.kind === 'item' ? waterCanOf(held.item) : null) : null;
    if (can && t.kind === 'filler') {
      if (key !== this.pourTargetKey) {
        this.pourTargetKey = key;
        this.pourOut = held?.kind === 'tool' && (can.litres ?? 0) <= 0.01;
      }
      // (out of a drinking vessel it only goes in; a jerrycan/oil/radiator bottle follows Wheel-selected pourOut)
      const dir = held?.kind === 'item' ? 'in' : this.pourOut ? 'out' : 'in';
      if (this.flow && (this.flow.dir !== dir || this.flow.v !== t.v)) this.endFlow();
      this.flow ??= { dir, v: t.v, liquid: t.liquid, moved: 0, fuel: '' };
      const moved = dir === 'in' ? pour(can, t.v.build, dt) : siphon(can, t.v.build, dt);
      this.lastMoved = moved;
      if (moved > 0) {
        this.flow.moved += moved;
        this.flow.fuel = can.kind === 'jerrycan' ? FUEL_ZH[can.fuel ?? 'petrol'] : LIQUID[t.liquid].zh;
        t.v.sys.rebuild();
        t.v.awake = 1;
        host.sound('pour', moved);
      }
      return;
    }
    // the button held on what takes paint: the coat goes on where the spray lands (coat.ts), the ring shows how
    // much of the thing it covers now
    if (t.kind === 'paint' && held?.kind === 'tool' && held.tool.kind === 'spray') {
      const a = t.aim;
      this.progress = 0;
      if (!this.primary || this.sprayDry || sprayLeft(held.tool) <= 0) return;
      const r = host.spray(a, held.tool, dt);
      this.progress = r.t;
      if (!r.already && (r.used > 0 || r.done)) this.spraying = { aim: a, t: r.t };
      return;
    }
    if (!this.primary && !this.secondary) this.progress = 0;
  }

  /** the liquid stopped: say how much went where */
  private endFlow(): void {
    const f = this.flow;
    this.flow = null;
    if (!f || f.moved < 0.02) return;
    const what = f.fuel || LIQUID[f.liquid].zh;
    this.host.ui.items.showDone(f.port?.pump ? `灌进油桶 <b>${f.moved.toFixed(1)} L</b> ${what}` : f.dir === 'in' ? `加进去 <b>${f.moved.toFixed(1)} L</b> ${what}` : `抽出来 <b>${f.moved.toFixed(1)} L</b> ${what}`);
  }

  /** fit the held part to a mount (or a sub-mount); what was there comes into the hands */
  private fit(v: ModVehicle, mount: MountDef, sub: string | null, inst: PartInstance): void {
    let old: PartInstance | null;
    if (sub) {
      const host = v.build.parts[mount.id];
      if (!host) return;
      old = fitSub(host, sub, inst);
    } else {
      // a bare rim held up to a hub keeps the tyre that is on it now
      const was = v.build.parts[mount.id];
      if (partDef(inst.part).rim?.tire && !inst.sub.tire && was?.sub.tire) {
        inst.sub.tire = was.sub.tire;
        delete was.sub.tire;
      }
      old = fitPart(v.build, mount.id, inst);
    }
    this.held = old ? { kind: 'part', inst: old } : null;
    this.ghostTick = 0;
    this.ghostHeld = null;
    this.host.changed(v, `on:${mount.id}${sub ? `:${sub}` : ''}`);
    this.host.sound('ratchet_done');
  }

  /** a meal, a drink or a pill going on: bites, swallows, and what it does at the end */
  private stepUse(dt: number): void {
    const u = this.use!;
    const host = this.host;
    // (the thing gone from the hands: nothing to go on with)
    const h = this.slots[u.slot];
    if (!h || h.kind !== 'item' || h.item !== u.item) {
      this.use = null;
      return;
    }
    const d = itemDef(u.item.item);
    u.t += dt;
    if (u.kind === 'drink') {
      // held to the mouth while the button is held; the liquid flows after half a second
      if (!this.secondary || (u.item.litres ?? 0) <= 0.001) {
        if (u.t > 0.5) host.sound('gulp');
        this.use = null;
        return;
      }
      if (u.t > 0.5 && d.drink) {
        const l = Math.min(u.item.litres ?? 0, d.drink.rate * dt);
        // (what is in it: its own where it can hold any — a bucket of rain, a mug of coffee: core/v3/nd/water.ts)
        const liquid = u.item.state?.liquid ?? d.drink.liquid;
        u.item.litres = Math.max(0, (u.item.litres ?? 0) - l);
        if (u.item.litres <= 0 && u.item.state?.liquid) delete u.item.state.liquid;
        host.drank(liquid, l);
        host.sound('glug');
      }
      this.progress = d.drink ? 1 - (u.item.litres ?? 0) / d.drink.litres : 0;
      return;
    }
    // eating: about five bites between the hand coming up and going down
    if (u.kind === 'eat') {
      const want = Math.min(6, Math.floor((u.t - 1.07) / 0.45) + 1);
      if (u.t > 1.07 && want > this.bites && u.t < 3.7) {
        this.bites = want;
        host.sound('bite');
      }
    }
    this.progress = Math.min(1, u.t / u.dur);
    if (u.t >= u.dur) {
      // gone: out of the hands, into one — one of them: the rest of a stack stays in its slot
      const one = this.takeOne(u.slot) ?? u.item;
      this.use = null;
      this.progress = 0;
      // (the button is still down as the last bite goes: that press was the meal, and is over — it does not go on to
      // pick up the stove one happens to be looking at)
      this.spent = true;
      host.consume(one);
      host.sound('gulp');
    }
  }

  /**
   * Put the held thing into a vehicle without aiming (G held looking at it): the lowest free spot of its
   * first zone with room, a shut lid or door over it opened. False: there is no room anywhere in it.
   */
  packIn(v: ModVehicle): boolean {
    const held = this.held;
    if (!held || moving(v)) return false;
    // (looking at its roof rack: up there — from where one stands the line of sight skims a car's roof, its rails in
    // the way of anything further in, so the roof is where the eyes are on it rather than where they land)
    const roof = this.host.cargo.landing([v], this.ray, held, 3.2, null, 99);
    const up = roof && roof.zone.id === 'roof' && 'x' in roof ? this.host.cargo.spotIn(v, 'roof', held, { x: roof.x, z: roof.z }) : null;
    const at = up ?? this.host.cargo.packSpot(v, held);
    if (!at) {
      // (nowhere but a boot without its lid: that is why)
      const lidless = zonesFor(v.view.frame.id, v.build).some((z) => zoneLidless(v.view.frame.id, z, v.build));
      this.flashWhy(lidless ? LIDLESS_WHY : '车里放不下了');
      return false;
    }
    if (!zoneOpen(v, at.zone)) {
      const via = this.nearestVia(v, at.zone);
      if (via && v.view.hasPanel(via.id)) {
        v.view.setPanelOpen(via.id, true);
        this.host.sound('door_open', 1, via.id);
      }
    }
    if (this.flow) this.endFlow();
    this.host.cargo.stow(v, at.zone, at.spot, held);
    this.held = null;
    this.host.sound('putdown', massOfHeld(held));
    return true;
  }

  /**
   * put the held thing down in front, on whatever surface is there — not where it would come to rest in the way of
   * something (its box shrunk to 85 % meeting another thing, a wall, a vehicle's body: Nomad Drive refuses the drop then,
   * 位置被挡住，无法在此丢弃, and it stays in the hands)
   */
  putDown(): boolean {
    const held = this.held;
    if (!held) return false;
    const w = this.walker;
    const d = 0.8;
    const x = w.x + Math.cos(w.heading) * d;
    const z = w.z + Math.sin(w.heading) * d;
    const y = w.y + 1.0;
    const box = this.host.cargo.boxOf?.(held);
    if (box && !this.host.loose.dropPose(box, x, y, z, w.heading).ok) {
      this.flashWhy(DROP_BLOCKED);
      return false;
    }
    if (this.flow) this.endFlow();
    const l = held.kind === 'part' ? this.host.loose.addPart(held.inst, x, y, z, w.heading) : held.kind === 'item' ? this.host.loose.addItem(held.item, x, y, z, w.heading) : this.host.loose.addTool(held.tool, x, y, z, w.heading);
    this.host.loose.drop(l);
    this.held = null;
    this.host.sound('putdown', partMass(held));
    return true;
  }

  // ------------------------------------------------------------------ the words on screen

  /** the card of a zone of a vehicle: what is in it, what it weighs */
  private zoneCard(v: ModVehicle, zone: CargoZone): ItemCard {
    const inZone = this.host.cargo.placedIn(v, zone.id).length;
    const kg = this.host.cargo.loadOf(v);
    return {
      key: `zone:${v.build.uid}:${zone.id}:${inZone}:${kg.toFixed(0)}`,
      icon: 'box',
      cat: `${v.view.frame.name.zh} · 放东西的地方`,
      name: zone.label.zh,
      stars: 0,
      badges: [],
      blurb: zone.max === 'small' ? '只放得下小东西。' : zone.max === 'medium' ? '放得下中等大小的东西。' : '大件也放得下。放进去的东西不会掉出来。',
      rows: [
        { value: `${inZone} 件`, label: zone.wall ? '墙上挂着' : `${zone.label.zh}里` },
        { value: `${kg.toFixed(0)} kg`, label: '车里一共装了' },
      ],
      bars: [],
      notes: [],
      foot: {},
    };
  }

  /** the card of a held thing (or of one lying about); a thing's (items.ts) is the one made last time until something on it changes: do not write into it */
  cardOf(h: NonNullable<Held>): ItemCard {
    const card = h.kind === 'part' ? partCard(h.inst) : h.kind === 'item' ? itemCardKept(h.item, itemNow(), this.clock) : toolCard(h.tool);
    // (a thing of a set: what of the set is still wanting, as things stand now — docs/V3/plan/finish.md §二 3)
    const wanting = this.host.kitNote?.(h);
    if (!wanting) return card;
    // (a kept card with the same line is the same card: shown again it is not looked into)
    const was = this.wantingCards.get(card);
    if (was && was.wanting === wanting) return was;
    const made = { ...card, wanting };
    this.wantingCards.set(card, made);
    return made;
  }
  private readonly wantingCards = new WeakMap<ItemCard, ItemCard>();

  /** a vehicle's card, made again a few times a second (it reads the whole build) */
  private vehicleCard(v: ModVehicle): ItemCard {
    const c = this.vehicleCardCache;
    if (c && c.key === v.build.uid && this.clock - c.t < 0.25) return c.card;
    const card = vehicleCard(v);
    this.vehicleCardCache = { key: v.build.uid, t: this.clock, card };
    return card;
  }

  /** the card of the container a filler leads into (the tank, the radiator, the engine) */
  private containerCard(v: ModVehicle, liquid: LiquidKind): ItemCard | null {
    const m = v.view.fillerMount(liquid);
    const inst = m ? v.build.parts[m] : null;
    return inst ? partCard(inst, { mount: v.view.frame.name.zh }) : null;
  }

  /** where a liquid's filler is, in words */
  private fillerWhere(v: ModVehicle, liquid: LiquidKind): string {
    if (liquid === 'fuel') return v.view.capWhere;
    if (!v.view.fillerMount(liquid)) return liquid === 'water' ? '（这辆车没有散热器）' : '（这辆车没有发动机）';
    return liquid === 'water' ? '散热器顶上的蓝色盖子' : '发动机顶上的黄色盖子';
  }

  /** the pick-up line as it was last made, and what it was made for: it is made again when one of these changes, not every frame */
  private readonly pickLine = { name: '', box: '', code: -1, text: '' };

  /**
   * "拿起 X（叠到快捷栏 1）": what E would pick up, and where it would go when that is not simply the empty
   * hands — onto the stack in a slot, into the basket, into the other slot (roomFor has just been asked:
   * goes, goesSlot). part: how many of a stack would go in when not all of it (0: all).
   */
  private pickWords(name: string, held: boolean, part: number): string {
    const goes = this.goes;
    const slot = this.goesSlot;
    const into = goes === 2 ? this.slots[slot] : null;
    const box = into?.kind === 'item' ? into.item.item : '';
    const code = goes + (slot + 1) * 4 + (held ? 256 : 0) + part * 512;
    const m = this.pickLine;
    if (m.code === code && m.name === name && m.box === box) return m.text;
    m.code = code;
    m.name = name;
    m.box = box;
    // (one verb and the name: where it goes and how many of a stack are the hotbar's to show — docs/V3/plan/prompts.md §五)
    void slot;
    void part;
    void box;
    m.text = `拿起 <b>${name}</b>`;
    return m.text;
  }

  private ui(): void {
    const ui = this.host.ui;
    const t = this.target;
    const held = this.held;
    const name = (inst: PartInstance): string => partDef(inst.part).name[ui.lang];
    const acts: Action[] = [];
    let aim: ItemCard | null = null;
    let xfer: TransferView | null = null;
    const both = this.freeSlot() < 0;
    // (the thing lying about that the mark is on: whether the hands have room for any of it)
    let noRoom = false;
    // a cleaning tool: the left button scrubs what the mark is on (E keeps opening doors and lids)
    if (held?.kind === 'tool' && cleanerOf(held.tool)) {
      const c = cleanerOf(held.tool)!;
      const sc = this.scrub;
      // (while scrubbing nothing is said: the surface shows what comes off)
      if (!sc && this.scrubAim) acts.push((held.tool.life ?? 1) > 0 ? { keys: ['LMB'], hold: true, text: `${c.word.zh} <b>${this.scrubAim.label}</b>` } : { keys: ['LMB'], hold: true, text: c.word.zh, off: true, why: '用坏了' });
    }
    if (t) {
      switch (t.kind) {
        case 'loose': {
          const h = heldOf(t.loose);
          aim = this.cardOf(h);
          const room = this.roomFor(h);
          noRoom = room <= 0;
          acts.push({ keys: E, text: this.pickWords(heldName(h), !!held, h.kind === 'item' && room < countOf(h.item) ? room : 0) });
          const off = held ? null : subOff(t.loose);
          if (off) acts.push({ keys: F, hold: true, text: off === 'tire' ? '拆下轮胎' : '拆下涡轮' });
          break;
        }
        case 'looseSub':
          aim = partCard(t.loose.part!);
          acts.push({ keys: E, hold: true, text: `装到 <b>${name(t.loose.part!)}</b> 上` });
          break;
        case 'ghost': {
          if (held?.kind !== 'part') break;
          const inst = held.inst;
          const lid = t.v.view.shutOver(t.mount.id);
          const lidName = lid ? (t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? '') : '';
          // (before → after: an assist, off unless one turns it on — F2)
          aim = this.showCardOn ? fitCard(t.v, t.mount.label[ui.lang], inst, this.compareLines(t.v, t.mount, t.sub, inst)) : null;
          if (moving(t.v)) acts.push({ keys: E, hold: true, text: '装上', off: true, why: '先停车' });
          else if (lid) acts.push({ keys: E, hold: true, text: '装上', off: true, why: `先开${lidName}` });
          else acts.push({ keys: E, hold: true, text: `${t.replace ? '换上' : '装上'} <b>${name(inst)}</b>` });
          break;
        }
        case 'part': {
          const inst = t.v.build.parts[t.mount.id];
          if (!inst) break;
          aim = partCard(inst, { mount: t.mount.label[ui.lang] });
          const panel = t.v.view.hasPanel(t.mount.id);
          const seat = t.mount.cat === 'seat' || t.mount.cat === 'steering';
          if (panel) acts.push({ keys: E, text: `${t.v.view.panelOpen(t.mount.id) > 0.5 ? '关上' : '打开'} <b>${name(inst)}</b>` });
          // (a can of a liquid in the hands: where its filler is, too)
          const can = held?.kind === 'tool' ? liquidOf(held.tool) : null;
          if (panel && can) acts.push({ keys: E, hold: true, text: '倒', off: true, why: `对着${LIQUID[can].filler}` });
          else if (seat && !held && t.seatIntent !== 'detach') {
            const at = this.seatFor(t.v, t.mount, null);
            if (at) acts.push({ keys: E, text: at === 'pass' ? '坐进副驾' : `上车 <b>${t.v.view.frame.name[ui.lang]}</b>`, ...(this.host.partsOnly?.(t.v) ? { off: true, why: '只能拆零件' } : {}) });
          }
          if (!held) {
            // Secondary promotion: functional parts (doors, hood, trunk, front seats) put detach on Hold E;
            // non-functional mounted parts (engine, wheel, battery, etc.) promote detach to Hold LMB.
            const detKey = this.targetHasPrimary(t, held) ? F : E;
            const lid = t.v.view.shutOver(t.mount.id);
            if (moving(t.v)) acts.push({ keys: detKey, hold: true, text: '拆下', off: true, why: '先停车' });
            else if (lid) acts.push({ keys: detKey, hold: true, text: '拆下', off: true, why: `先开${t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? ''}` });
            else if (t.mount.cat === 'seat' && this.thingsOn(t.v, t.mount) > 0) acts.push({ keys: detKey, hold: true, text: '拆下', off: true, why: '先拿走上面的东西' });
            else acts.push({ keys: detKey, hold: true, text: `拆下 <b>${name(inst)}</b>` });
          }
          break;
        }
        case 'filler': {
          const own = held?.kind === 'tool' ? held.tool : null;
          const tool = own ?? (held?.kind === 'item' ? waterCanOf(held.item) : null);
          if (!tool) break;
          const L = LIQUID[t.liquid];
          aim = this.containerCard(t.v, t.liquid);
          if (!t.open) {
            if (t.liquid === 'fuel') acts.push({ keys: E, hold: true, text: '倒', off: true, why: `先开${L.filler}盖` });
            else acts.push({ keys: E, hold: true, text: '倒', off: true, why: '先开引擎盖' });
            break;
          }
          const k = this.keyOf(t);
          if (k !== this.pourTargetKey) {
            this.pourTargetKey = k;
            this.pourOut = !!own && (own.litres ?? 0) <= 0.01;
          }
          const outDir = !!own && this.pourOut;
          if (outDir && own) {
            const back = siphonUse(own, t.v.build);
            acts.push(back.can ? { keys: E, hold: true, text: '抽回' } : { keys: E, hold: true, text: '抽回', off: true, why: back.why?.[ui.lang] });
          } else {
            const use = toolUse(tool, t.v.build);
            acts.push(use.can ? { keys: E, hold: true, text: use.word[ui.lang] } : { keys: E, hold: true, text: use.word[ui.lang], off: true, why: use.why?.[ui.lang] });
          }
          if (own) acts.push({ keys: ['Wheel'], text: outDir ? '切为倒入' : '切为抽回' });
          if (this.flow) xfer = this.transferView(t.v, t.liquid, tool, own ? undefined : held?.kind === 'item' ? { name: itemDef(held.item.item).name.zh, capacity: itemDef(held.item.item).drink?.litres ?? 1 } : undefined);
          break;
        }
        case 'pour': {
          if (held?.kind !== 'tool' || !liquidOf(held.tool)) break;
          const liquid = liquidOf(held.tool)!;
          const L = LIQUID[liquid];
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, hold: true, text: '倒', off: true, why: `对着${L.filler}` });
          break;
        }
        case 'cap': {
          const open = t.v.view.capOpen;
          aim = this.containerCard(t.v, 'fuel');
          acts.push({ keys: E, text: `${open ? '关上' : '打开'} <b>加油口盖</b>` });
          break;
        }
        case 'paint': {
          if (held?.kind !== 'tool' || held.tool.kind !== 'spray') break;
          const a = t.aim;
          const mount = a.v && a.mount ? a.v.view.frame.mounts.find((m) => m.id === a.mount) : undefined;
          aim = a.inst ? partCard(a.inst, mount ? { mount: mount.label[ui.lang] } : undefined) : a.v ? this.vehicleCard(a.v) : null;
          // (one verb and the name: the colour is the brush's shadow's, how far the coat is its ring's, rust and dirt
          // under it its rim's in amber — docs/V3/plan/hands.md §六)
          if (sprayLeft(held.tool) <= 0) acts.push({ keys: E, hold: true, text: '喷', off: true, why: '罐子空了' });
          else acts.push({ keys: E, hold: true, text: `喷 <b>${a.label}</b>` });
          break;
        }
        case 'body':
          // (looked at from anywhere but beside a front seat: what it is and what it still needs, and no press)
          aim = this.vehicleCard(t.v);
          break;
        case 'enter':
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, text: t.seat === 'pass' ? '坐进副驾' : `上车 <b>${t.v.view.frame.name[ui.lang]}</b>`, ...(this.host.partsOnly?.(t.v) ? { off: true, why: '只能拆零件' } : {}) });
          break;
        case 'device': {
          if (t.own) {
            // (a system's device: its words and its card are its own code — one that throws is reported and shown without them)
            try {
              aim = this.deviceWords(t.device, held, acts);
            } catch (e) {
              this.host.interact?.fault(t.device, 'word', e);
            }
          } else aim = this.deviceWords(t.device, held, acts);
          break;
        }
        case 'tank': {
          const p = t.port;
          aim = p.card;
          if (!held) {
            acts.push({ keys: E, text: `${p.open ? '拧上' : '拧开'} <b>油箱盖</b>` });
            break;
          }
          if (held.kind !== 'tool' || held.tool.kind !== 'jerrycan') break;
          if (p.pump) {
            // a filling station's pump: the can filled from it
            const pf = (Object.keys(p.tank.fuel)[0] ?? 'petrol') as FuelType;
            const has = (held.tool.litres ?? 0) > 0.01 ? (held.tool.fuel ?? 'petrol') : null;
            const u = tankUse(held.tool, p.tank).out;
            const why = has && has !== pf ? `这台是${FUEL_ZH[pf]}` : (p.tank.fuel[pf] ?? 0) <= 0.01 ? '没油了' : (u.why?.[ui.lang] ?? '');
            acts.push(u.can ? { keys: E, hold: true, text: `灌${FUEL_ZH[pf]}` } : { keys: E, hold: true, text: '灌油', off: true, why });
            if (this.flow?.port === p) xfer = this.tankTransfer(p, held.tool);
            break;
          }
          if (!p.open) {
            acts.push({ keys: E, hold: true, text: '倒', off: true, why: '空手拧开油箱盖' });
            break;
          }
          const k = this.keyOf(t);
          if (k !== this.pourTargetKey) {
            this.pourTargetKey = k;
            this.pourOut = (held.tool.litres ?? 0) <= 0.01;
          }
          const u = tankUse(held.tool, p.tank);
          if (this.pourOut) acts.push(u.out.can ? { keys: E, hold: true, text: '抽回' } : { keys: E, hold: true, text: '抽回', off: true, why: u.out.why?.[ui.lang] });
          else acts.push(u.in.can ? { keys: E, hold: true, text: `加${FUEL_ZH[held.tool.fuel ?? 'petrol']}` } : { keys: E, hold: true, text: '加油', off: true, why: u.in.why?.[ui.lang] });
          acts.push({ keys: ['Wheel'], text: this.pourOut ? '切为倒入' : '切为抽回' });
          if (this.flow?.port === p) xfer = this.tankTransfer(p, held.tool);
          break;
        }
        case 'stow': {
          const { v, zone, spot, why } = t.aim;
          aim = this.zoneCard(v, zone);
          if (spot && held) acts.push({ keys: E, text: zone.put ?? `放进${zone.label.zh}` }, { keys: ['Wheel'], text: '转' });
          else acts.push({ keys: E, text: '放进', off: true, why: why || '放不下' });
          break;
        }
      }
    }
    // a spray can off what takes paint: what the mark is on does not
    if (held?.kind === 'tool' && held.tool.kind === 'spray' && t?.kind !== 'paint' && this.paintAim && !this.paintAim.paintable && acts.length === 0) acts.push({ keys: E, hold: true, text: '喷', off: true, why: '这里喷不上' });
    // a thing in the hands that works the buttons by itself (kernel/heldUse.ts): its words when the mark is on nothing, or while it is at it
    const hu = this.heldUse();
    if (hu && held?.kind === 'item' && (this.huBusy || !t)) heldCall(undefined, () => hu.acts?.(held.item, this.sel, !!t, acts));
    const huRing = hu && held?.kind === 'item' ? heldCall(null, () => hu.ring?.(held.item, this.sel) ?? null) : null;
    // (old Q-to-stow into vehicles/furniture removed 2026-11-27: all stowing uses R placement mode)
    // (held in a seat: how one gets up, as the system holding one says)
    if (this.pin) acts.push(...this.pin.words);
    // (the press on what the mark is on the hands' own: their words alone, the same as down the right — a kit on what it
    // mends offers the mending and nothing else, as Nomad Drive's does: no picking it up, no taking it off)
    const hands = held ? this.handsUse() : null;
    const handsAim = hands && held ? (hands.aims?.(held) ?? null) : null;
    if (handsAim) acts.splice(0, acts.length, ...handsAim);
    // (the card only for what is close by: from further off it would stand in the way of the view)
    if (aim && t && (t.at ?? t.dist) > CARD_NEAR) aim = null;
    if (t?.kind === 'loose' && noRoom && !handsAim) acts.splice(0, acts.length, { keys: E, text: '拿起', off: true, why: '手满了' });
    if (this.dropT > 0 && held) acts.splice(0, acts.length, { keys: ['Q'], text: '放下' });
    // (while liquid flows the strip saying from what into what stands where these words are)
    if (xfer) acts.length = 0;
    const handsRing = hands && held ? (hands.ring?.(held) ?? -1) : -1;
    const ring = huRing ? huRing.value : handsRing >= 0 ? handsRing : this.qCharge > 0 ? this.qCharge : this.dropT > 0 && held ? Math.min(1, this.dropT / DROP_HOLD) : this.progress > 0 ? this.progress : (this.pin?.ring ?? 0) > 0 ? this.pin!.ring! : -1;
    // (the thing in the hands may put the mark away: a fish on the line, the eye on the water — its ring still shows)
    const markAway = !huRing && hu && held?.kind === 'item' ? heldCall(false, () => hu.hidesMark?.(held.item, this.sel) ?? false) : false;
    ui.prompt(!this.scrub && !markAway, '', ring, huRing?.colour);
    // (a stand-in HUD without the bars beside the mark: nothing said)
    ui.gauges?.(hu && held?.kind === 'item' ? heldCall(null, () => hu.gauges?.(held.item, this.sel) ?? null) : null);
    const items = ui.items;
    const rawKeys = this.heldKeys();
    // Arbiter rule 3 (target beats held item): any key claimed by the centre prompt is hidden from the right list.
    const keys = gateRightActions(acts, rawKeys);
    this.noteOffs(acts, keys);
    items.showActions(acts);
    // (while the thing in the hands is at it — a line out — its card stands aside: the view is the water's; a thing the
    // hands show instead — a fish held up — has its card there)
    const shown = hu && held?.kind === 'item' ? heldCall(null, () => hu.shows?.(held.item, this.sel) ?? null) : null;
    // (the held thing's card cut down to what it is and what is in it: the whole of it is the Tab list's — docs/V3/plan/prompts.md 定案 4;
    // what the mark is on has its whole card, whatever it is — a thing lying about, a part on a vehicle, a piece of furniture,
    // a machine — as our first cards were, Arctic Drive's: docs/V3/plan/finish.md §十九)
    items.showCards(shown ? this.cardOf({ kind: 'item', item: shown }) : held && !this.huBusy ? this.cardOf(held) : null, aim, this.cardsOn, true, false);
    // (the thing in the hands may have the HUD step aside: a fish on the line, a catch held up — only its own keys then)
    const quiet = hu && held?.kind === 'item' ? heldCall(false, () => hu.quiet?.(held.item, this.sel) ?? false) : false;
    items.showKeys(quiet ? this.heldKeys(true) : keys);
    items.showTransfer(xfer);
    items.showHotbar(quiet ? null : this.slotViews(), this.sel);
  }

  /** what liquid goes from what into what, with how much is in each */
  private transferView(v: ModVehicle, liquid: LiquidKind, tool: Tool, as?: { name: string; capacity: number }): TransferView {
    const L = LIQUID[liquid];
    // (a thing that holds water poured as the radiator's bottle: its own name and what it holds)
    const info = as ? { name: { zh: as.name, en: as.name }, capacity: as.capacity } : TOOL_INFO[tool.kind];
    const m = v.view.fillerMount(liquid);
    const inst = m ? v.build.parts[m] : null;
    let have = 0;
    let max = 1;
    if (inst) {
      const def = partDef(inst.part);
      if (liquid === 'fuel') {
        have = Object.values(inst.fluids.fuel ?? {}).reduce((a, b) => a + (b ?? 0), 0);
        max = def.fuelTank?.litres ?? 1;
      } else if (liquid === 'water') {
        have = inst.fluids.coolantL ?? 0;
        max = def.radiator?.coolantL ?? 1;
      } else {
        have = inst.fluids.oilL ?? 0;
        max = def.engine?.oilL ?? 1;
      }
    }
    const tone: Tone = tool.kind === 'jerrycan' ? (tool.fuel ?? 'petrol') : L.tone;
    const can = { name: tool.kind === 'jerrycan' ? `油桶 · ${FUEL_ZH[tool.fuel ?? 'petrol']}` : info.name.zh, amount: `${(tool.litres ?? 0).toFixed(1)} / ${info.capacity} L`, fill: (tool.litres ?? 0) / info.capacity };
    const box = { name: `${v.view.frame.name.zh}的${L.into}`, amount: `${have.toFixed(1)} / ${max.toFixed(max >= 10 ? 0 : 1)} L`, fill: have / Math.max(1e-6, max) };
    return this.flow?.dir === 'out' ? { from: box, to: can, tone } : { from: can, to: box, tone };
  }

  /** the strip while a can pours into a tank that is not a vehicle's (or draws from it) */
  private tankTransfer(p: TankPort, tool: Tool): TransferView {
    const info = TOOL_INFO.jerrycan;
    const have = tankLitres(p.tank);
    const tone: Tone = tool.fuel ?? 'petrol';
    const can = { name: `油桶 · ${FUEL_ZH[tool.fuel ?? 'petrol']}`, amount: `${(tool.litres ?? 0).toFixed(1)} / ${info.capacity} L`, fill: (tool.litres ?? 0) / info.capacity };
    const box = { name: p.name, amount: `${have.toFixed(1)} / ${p.tank.capacity.toFixed(0)} L`, fill: have / Math.max(1e-6, p.tank.capacity) };
    return this.flow?.dir === 'out' ? { from: box, to: can, tone } : { from: can, to: box, tone };
  }

  /** what each button would do now, from the words (sayWhy) */
  private noteOffs(...lists: Action[][]): void {
    this.offs.clear();
    for (const list of lists) {
      for (const a of list) {
        for (const k of a.keys) {
          let e = this.offs.get(k);
          if (!e) {
            e = { tap: null, hold: null, on: false, onHold: false };
            this.offs.set(k, e);
          }
          if (a.off) {
            const w = a.why ?? a.text.replace(/<[^>]+>/g, '');
            if (a.hold) e.hold ??= w;
            else e.tap ??= w;
          } else if (a.hold) e.onHold = true;
          else e.on = true;
        }
      }
    }
  }

  /**
   * A button pressed (docs/V3/plan/prompts.md §五, Zelda's way): where it does nothing but cannot do something, why —
   * a press at once, a hold once it has been down long enough to have begun one (stepWhy)
   */
  sayWhy(k: string): void {
    const e = this.offs.get(k);
    if (!e) return;
    // (it does nothing here at all: why at once, a press or the start of a hold alike)
    if (!e.on && !e.onHold) {
      const w = e.tap ?? e.hold;
      if (w) this.flashWhy(w);
      return;
    }
    // (a hold does something, a press would not: why if it was a press — said as the button comes up soon enough)
    if (e.tap && !e.on) this.tapWhy = { k, why: e.tap, t: 0 };
    // (a press does something, a hold would not: why once it has been held as long as a hold takes to begin)
    if (e.hold && !e.onHold) this.holdWhy = { k, why: e.hold, t: 0, said: false };
  }

  private stepWhy(dt: number, sec: boolean): void {
    const tw = this.tapWhy;
    if (tw) {
      const down = tw.k === 'LMB' ? this.primary : tw.k === 'E' ? sec : false;
      if (down) tw.t += dt;
      else {
        if (tw.t < TAP_S + 0.05) this.flashWhy(tw.why);
        this.tapWhy = null;
      }
    }
    const hw = this.holdWhy;
    if (!hw) return;
    const down = hw.k === 'LMB' ? this.primary : hw.k === 'E' ? sec : false;
    if (!down) {
      this.holdWhy = null;
      return;
    }
    hw.t += dt;
    if (!hw.said && hw.t >= 0.4) {
      hw.said = true;
      this.flashWhy(hw.why);
    }
  }

  /** why, over the words for a moment and gone (the same twice running: not again at once) */
  flashWhy(why: string): void {
    const now = performance.now();
    if (why === this.lastWhy && now - this.lastWhyAt < 600) return;
    this.lastWhy = why;
    this.lastWhyAt = now;
    this.host.ui.items.showDone(why, 1.5);
  }

  /**
   * what the keys do with the thing in the hands, down the right: its own (the right button's, the wheel's), and Q and R
   * whenever something is in the hands (the player's ask, 2026-11-26: the keys down the right as Nomad Drive's are, by
   * what one is doing — in a seat, standing up, carrying something; they were said only the first three times). `only`: a thing that works the buttons by itself (kernel/heldUse.ts) has the HUD step aside —
   * its own lines and nothing else
   */
  private heldKeys(only = false): Action[] {
    const h = this.held;
    const out: Action[] = [];
    const hu = this.handsUse();
    const own = hu && h ? hu.words?.(h) : undefined;
    if (!h) {
      // (empty hands: nothing — what the left button does is said where the mark is)
    } else if (own) {
      out.push(...own);
    } else if (h.kind === 'tool') {
      // (a can's pour and a cleaning tool's scrub are said where the mark is, on the filler, on the dirt; a spray can's wheel here)
      if (h.tool.kind === 'spray') out.push({ keys: ['Wheel'], text: '喷嘴' });
    } else if (h.kind === 'item' && heldUseOf(h.item)) {
      // (a thing that works the buttons by itself says what they do: kernel/heldUse.ts)
      const use = heldUseOf(h.item)!;
      heldCall(undefined, () => use.keys?.(h.item, this.sel, out));
      if (only) return out;
    } else if (h.kind === 'item' && itemDef(h.item.item).pack) {
      out.push({ keys: F, hold: true, text: '背上' });
    } else if (h.kind === 'item' && itemDef(h.item.item).wear) {
      out.push({ keys: F, hold: true, text: this.worn[itemDef(h.item.item).wear!.slot] ? '换上' : '穿上' });
    } else if (h.kind === 'item') {
      const d = itemDef(h.item.item);
      if (d.drink) out.push((h.item.litres ?? 0) > 0.001 ? { keys: F, hold: true, text: '喝' } : { keys: F, hold: true, text: '喝', off: true, why: '空了' });
      else if (d.eat) out.push({ keys: F, text: d.cat === 'med' ? '吃药' : '吃' });
    }
    // (Q throw/drop and R placement whenever something is in the hands)
    const takesQ = h?.kind === 'item' && !!heldUseOf(h.item)?.takesQ && heldCall(false, () => heldUseOf(h.item)!.takesQ!(h.item, this.sel));
    if (h && !this.host.listOpen && !this.placer?.placing && !takesQ) out.push({ keys: ['Q'], text: partMass(h) > THROW_MAX_KG ? '放下' : '丢弃 / 长按投掷' });
    if (h) {
      for (const n of this.keyNotes) {
        const a = n(h);
        if (a) out.push(a);
      }
    }
    // (a part goes where its ghost lights up: the line over the hotbar says so when it is aimed)
    // (a thing goes by the name it goes by everywhere: a kind the player does not know yet by the veil's, items.ts)
    return out;
  }

  /** the hotbar's two slots as shown */
  slotViews(): SlotView[] {
    // (shown is looked at: in a seat, where nothing else looks at the hands, too)
    this.settleHands();
    return this.slots.map((h) => {
      if (!h) return { icon: null, name: '空', empty: true };
      // (a stack: its name without the count, which is drawn in the slot's corner — nothing is built for the count here)
      const many = h.kind === 'item' ? countOf(h.item) : 1;
      const nameOf = h.kind === 'item' ? itemLabelPlain(h.item) : heldName(h);
      const t = h.kind === 'tool' ? h.tool : null;
      const liquid = t ? liquidOf(t) : null;
      const drink = h.kind === 'item' ? itemDef(h.item.item).drink : undefined;
      // (a spray can: the paint left, Arctic Drive's usage bar, in the can's colour)
      const spray = t?.kind === 'spray' ? { value: sprayLeft(t), max: SPRAY_TIERS[sprayTier(t)].capacity, tone: 'good' as Tone, colour: hexCss(paintHex(t.colour ?? 0)) } : undefined;
      // (a thing that holds things: how full it is, as on its card)
      const holds = h.kind === 'item' ? itemDef(h.item.item).holds : undefined;
      const fill = spray ?? (t && liquid ? { value: t.litres ?? 0, max: TOOL_INFO[t.kind].capacity, tone: (t.kind === 'jerrycan' ? (t.fuel ?? 'petrol') : LIQUID[liquid].tone) as Tone } : drink && h.kind === 'item' ? { value: h.item.litres ?? 0, max: drink.litres, tone: drinkTone(h.item.state?.liquid ?? drink.liquid) } : holds && h.kind === 'item' ? boxFill(h.item, holds) : undefined);
      return { icon: this.host.iconOf(h), name: nameOf, empty: false, fill, count: many };
    });
  }

  /** the vehicle now against with the held part on that mount (cached while aimed) */
  private compareLines(v: ModVehicle, mount: MountDef, sub: string | null, inst: PartInstance): ReturnType<typeof compare> {
    const key = `${v.build.uid}:${mount.id}:${sub ?? ''}:${inst.uid}:${v.sys.derived.mass.toFixed(1)}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      const before = quickPerf(v.sys.derived);
      const after = perfWith(v.build, mount.id, inst, sub);
      this.cardCache = compare(before, after);
    }
    return this.cardCache ?? [];
  }

  telemetry(): Record<string, string | number | boolean> {
    const t = this.target;
    const id = (h: Held): string => (h ? (h.kind === 'part' ? h.inst.part : h.kind === 'item' ? `item:${h.item.item}` : `tool:${h.tool.kind}`) : '');
    /** how many it is: a stack's count, 1 for anything else, 0 for nothing */
    const n = (h: Held | undefined): number => (h ? (h.kind === 'item' ? countOf(h.item) : 1) : 0);
    return {
      held: id(this.held),
      slot1: id(this.slots[0]),
      slot2: id(this.slots[1]),
      heldN: n(this.held),
      slot1N: n(this.slots[0]),
      slot2N: n(this.slots[1]),
      // every slot's count, the backpack's too ("3,0,12")
      counts: this.slots.map(n).join(','),
      sel: this.sel,
      target: this.keyOf(t),
      progress: this.progress,
      flow: this.flow ? `${this.flow.dir}:${this.flow.liquid}:${this.flow.moved.toFixed(2)}` : '',
      footX: this.walker.x,
      footZ: this.walker.z,
      heading: this.walker.heading,
    };
  }
}

/** a vehicle that is rolling cannot be worked on */
function moving(v: ModVehicle): boolean {
  return Math.abs(v.sim.kmh) > 1.5;
}

/** what a held thing weighs (for the sound of putting it down) */
function massOfHeld(h: NonNullable<Held>): number {
  return partMass(h);
}

/**
 * A share of the walk with so much in the arms: Nomad Drive's at the light end (as fast as empty hands to 5 kg, 0.9
 * at 10, 0.8 at 15), gentler past it — its 0.1 by 50 kg was made for its things, the heaviest of them light, and
 * an engine here weighs 115 kg: 0.55 from 80 kg on, about a metre a second (it was 1.2 m/s for anything big).
 */
export function walkShare(kg: number): number {
  if (kg <= 5) return 1;
  if (kg <= 15) return 1 - ((kg - 5) / 10) * 0.2;
  if (kg <= 80) return 0.8 - ((kg - 15) / 65) * 0.25;
  return 0.55;
}

function partMass(h: Held): number {
  if (!h) return 0;
  if (h.kind === 'part') return partDef(h.inst.part).mass;
  if (h.kind === 'item') return itemMass(h.item);
  return h.tool.kind === 'jerrycan' ? 4 + (h.tool.litres ?? 0) * 0.75 : 1;
}

export { TOOL_INFO };
