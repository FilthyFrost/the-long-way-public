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
import { coatOf, SPRAY_TIERS, sprayLeft, sprayTier, type SprayResult } from '../../core/modcar/paint';
import { PALETTE, paintHex } from '../../core/modcar/palette';
import { compare, perfWith, quickPerf } from '../../core/modcar/stats';
import { canStack, countOf, itemDef, itemMass, mergeStacks, putInside, roomInside, setFreshRate, settleItem, splitStack, stackMax, stampFresh, type ItemInstance } from '../../core/modcar/items';
import { cleanerOf, liquidOf, pour, pourTank, siphon, siphonTank, siphonUse, tankLitres, tankUse, TOOL_INFO, toolName, toolUse, wearCleaner, type Cleaner, type FuelTank, type LiquidKind, type Tool } from '../../core/modcar/tools';
import type { MountDef, PartInstance, FuelType } from '../../core/modcar/types';
import { FootWalker, type FootInput } from '../../core/onfoot/walker';
import type { Land } from '../../core/onfoot/land';
import { SolidSet, type SolidSource } from '../../core/world/solids';
import { GhostLayer, type GhostSpec } from './ghosts';
import type { Action, SlotView, TransferView } from './hudItems';
import { deviceCard, fitCard, FUEL_ZH, hexCss, itemCardKept, itemLabel, itemLabelPlain, partCard, toolCard, vehicleCard, type ItemCard, type Tone } from './itemInfo';
import { itemNow } from './itemTime';
import type { Loose, LooseThings } from './loose';
import type { ModUI } from './ui';
import type { ModVehicle } from './vehicle';
import type { GarageDevice } from './garageStub';
import type { InteractSources } from './kernel/interact';
import type { CargoBay, StowAim } from './cargo';
import type { CargoZone } from '../../core/modcar/cargo';

export type Held = { kind: 'part'; inst: PartInstance } | { kind: 'tool'; tool: Tool } | { kind: 'item'; item: ItemInstance } | null;

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

/** a loose thing as it would be in the hands */
export function heldOf(l: Loose): NonNullable<Held> {
  return l.part ? { kind: 'part', inst: l.part } : l.tool ? { kind: 'tool', tool: l.tool } : { kind: 'item', item: l.item! };
}

/** what the mark is on, and what the buttons would do to it (dist may be nudged to rank one over another; at = how far it really is then) */
type Target = (
  | { kind: 'loose'; loose: Loose; dist: number }
  | { kind: 'ghost'; v: ModVehicle; mount: MountDef; sub: string | null; replace: boolean; dist: number }
  | { kind: 'looseSub'; loose: Loose; sub: string; dist: number }
  | { kind: 'part'; v: ModVehicle; mount: MountDef; dist: number }
  /** a can at the filler its liquid goes into (open: the flap or cap is open, no shut bonnet over it) */
  | { kind: 'filler'; v: ModVehicle; liquid: LiquidKind; open: boolean; dist: number }
  /** a can held elsewhere on the body: the words say where its filler is */
  | { kind: 'pour'; v: ModVehicle; dist: number }
  /** the filler flap (or a motorcycle's tank cap), empty-handed: E opens and shuts it */
  | { kind: 'cap'; v: ModVehicle; dist: number }
  /** a spray can on what takes paint (the body, a door, a lid, a bumper, a mirror; lying about too) */
  | { kind: 'paint'; aim: PaintAim; dist: number }
  | { kind: 'enter'; v: ModVehicle; dist: number }
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
  enter(v: ModVehicle): void;
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
  drank(liquid: 'water' | 'alcohol' | 'energy', litres: number): void;
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
}

/** a zone is in reach: one of the panels it is reached through open, or not there at all */
export function zoneOpen(v: ModVehicle, zone: CargoZone): boolean {
  if (!zone.via?.length) return true;
  return zone.via.some((m) => !v.build.parts[m] || !v.view.hasPanel(m) || v.view.panelOpen(m) > 0.5);
}

/** what F takes off a part lying about: its tyre (a wheel), else its turbo (an engine) */
function subOff(l: Loose): 'tire' | 'turbo' | null {
  return l.part?.sub.tire ? 'tire' : l.part?.sub.turbo ? 'turbo' : null;
}

const REACH = 2.6;
/** the card of what the mark is on shows only this close (m): from further off it would stand in the way of the view */
const CARD_NEAR = 2.2;
const GHOST_RANGE = 4.2;
/** angle (rad) within which the mark picks a ghost */
const GHOST_CONE = 0.2;
const DROP_HOLD = 0.45;

/** what each liquid is called, and its colour on the bars */
const LIQUID: Record<LiquidKind, { zh: string; into: string; filler: string; tone: Tone }> = {
  fuel: { zh: '油', into: '油箱', filler: '加油口', tone: 'petrol' },
  water: { zh: '水', into: '散热器', filler: '加水口', tone: 'water' },
  oil: { zh: '机油', into: '发动机', filler: '加机油口', tone: 'oil' },
};

const E: Action['keys'] = ['E', 'LMB'];
const F: Action['keys'] = ['F', 'RMB'];

export class ModPlayer {
  readonly walker: FootWalker;
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
  /** progress of the hold in hand (0…1), and what it is for (a target key) */
  progress = 0;
  private progressKey = '';
  private dropT = 0;
  /**
   * A fit or a take-off just finished with the button still down: nothing more until it is let go (with
   * holds this short, a button held on would put the part on, the old one back, and so on)
   */
  private spent = false;
  /** how long F has been held to put a backpack on */
  private selectT = 0;
  /** the buttons */
  primary = false;
  secondary = false;
  /** with a cleaning tool: what the mark is on that it can clean (the left button held scrubs it) */
  scrubAim: ScrubHit | null = null;
  /** scrubbing (the left button held with a cleaning tool): null when not */
  scrub: Scrub | null = null;
  private readonly sv1 = new THREE.Vector3();
  private readonly sv2 = new THREE.Vector3();
  private readonly sv3 = new THREE.Vector3();
  private readonly sv4 = new THREE.Vector3();
  private secondaryWas = false;
  /**
   * Something being eaten, drunk or taken (F or the right button): what, how long since it began, from which
   * slot; drinking goes on while the button is held
   */
  use: { kind: 'eat' | 'pill' | 'drink'; t: number; slot: number; item: ItemInstance; dur: number } | null = null;
  private bites = 0;
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
        if (h?.kind !== 'item' || h.item === it || h.item === not || !itemDef(h.item.item).holds) continue;
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
   * slots that hold its sort, then into a free slot (the selected one when empty, else the first empty), which
   * is then the one in the hands, as a thing picked up always was. Returns how many of it did not go in: 0
   * when all of it did — the caller lets go of it then, whatever its count reads (it sits in a slot or in a
   * basket itself, or it went onto stacks and its count reads 0); otherwise the thing stays the caller's,
   * with that count. `not`: a thing in the hands it must not go into (the basket it is being taken out of).
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
        if (x?.kind === 'item' && x.item !== not && itemDef(x.item.item).holds) left = putInside(x.item, it, now);
      }
      if (left <= 0) return 0;
      const slot = this.freeSlot();
      if (slot < 0) return left;
      // (into a slot: in the open air from here, and started if it never was, with what is in it)
      stampFresh(it, now);
      setFreshRate(it, now, 1);
      s[slot] = h;
      this.sel = slot;
      return 0;
    }
    const slot = this.freeSlot();
    if (slot < 0) return 1;
    this.slots[slot] = h;
    this.sel = slot;
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
    if (from === 'mouse' && this.startScrub()) return;
    this.primaryEdge = true;
    this.primary = true;
  }

  release(from: 'key' | 'mouse' = 'key'): void {
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
      this.host.ui.say(`${TOOL_INFO[held.tool.kind].name.zh}用坏了：丢进回收台，再做一个。`, 2.4);
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
            this.host.ui.say(`${TOOL_INFO[held.tool.kind].name.zh}用坏了。`, 2.4);
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
    // (otherwise the wheel goes through the hotbar: a spray can is one colour, Arctic Drive's)
    this.select((this.sel + (delta > 0 ? 1 : this.slots.length - 1)) % this.slots.length);
  }

  /** the hands are busy elsewhere (the bench has the view): nothing is aimed at, no prompts */
  aside = false;

  // ------------------------------------------------------------------ every frame on foot

  update(dt: number, lookYaw: number, lookPitch: number, keys: { run: boolean; jump: boolean; drop: boolean; take: boolean; forward: number; right: number }): void {
    const w = this.walker;
    this.clock += dt;
    // (what is in the hands, as it is by now: before it is carried, eaten or shown)
    this.settleHands();
    // (while liquid flows one stands still: from the frame the button goes down at an open filler)
    const t0 = this.target;
    const atOpen = (t0?.kind === 'filler' && t0.open) || (t0?.kind === 'tank' && t0.port.open && this.held?.kind === 'tool');
    const still = !!this.flow || (atOpen && (this.primary || keys.take)) || !!this.scrub;
    this.input.forward = still ? 0 : keys.forward;
    this.input.right = still ? 0 : keys.right;
    this.input.run = keys.run;
    this.input.jump = keys.jump && !still;
    w.heading = lookYaw;
    w.pitch = lookPitch;
    const h = this.held;
    const carry = h?.kind === 'part' ? partDef(h.inst.part).carry : h?.kind === 'item' ? itemDef(h.item.item).carry : 'small';
    w.load = h?.kind === 'part' || h?.kind === 'item' ? (carry === 'large' ? 'large' : carry === 'medium' ? 'medium' : 'none') : 'none';
    w.advance(dt, this.input);
    this.input.jump = false;
    w.eye(this.eye);
    w.look(this.dir);
    this.secondaryWas = this.secondary;
    this.secondary = keys.take;

    this.target = this.aside ? null : this.pick();
    if (this.scrub) this.stepScrub(dt);
    this.showHighlight();
    this.showGhosts();
    this.host.cargo.showGhost(this.target?.kind === 'stow' ? this.target.aim : null, this.held);
    this.act(dt, keys.drop);
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

  private pick(): Target | null {
    const o = this.host.origin;
    this.ray.origin.set(this.eye.x - o.x, this.eye.y - o.y, this.eye.z - o.z);
    this.ray.direction.set(this.dir.x, this.dir.y, this.dir.z).normalize();
    const held = this.held;
    let best: Target | null = null;
    const better = (t: Target): void => {
      if (!best || t.dist < best.dist) best = t;
    };

    // holding a part: the ghost nearest the line of sight
    if (held?.kind === 'part') {
      const def = partDef(held.inst.part);
      let bestAng = GHOST_CONE;
      const sub = def.cat === 'tire' ? 'tire' : def.cat === 'turbo' ? 'turbo' : null;
      for (const v of this.near(GHOST_RANGE)) {
        const frame = v.view.frame;
        const mounts: { m: MountDef; sub: string | null }[] = [];
        if (sub) {
          // a tyre goes on a fitted rim that takes one, a turbo on a fitted engine that takes one
          for (const m of frame.mounts) {
            const inst = v.build.parts[m.id];
            if (inst && subMountsOf(partDef(inst.part)).includes(sub)) mounts.push({ m, sub });
          }
        } else for (const m of mountsFor(frame, def)) mounts.push({ m, sub: null });
        for (const { m, sub: s } of mounts) {
          for (const p of this.aimPoints(v, m)) {
            const dx = p.x - this.eye.x;
            const dy = p.y - this.eye.y;
            const dz = p.z - this.eye.z;
            const d = Math.hypot(dx, dy, dz);
            if (d > GHOST_RANGE) continue;
            const ang = Math.acos(Math.min(1, (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / Math.max(1e-6, d)));
            // nearer ghosts get a wider cone (they are bigger on screen)
            const cone = bestAng * Math.min(2.2, 1.6 / Math.max(0.7, d));
            if (ang < cone && ang < bestAng * 2.2) {
              bestAng = ang;
              const replace = s ? !!v.build.parts[m.id]?.sub[s] : !!v.build.parts[m.id];
              best = { kind: 'ghost', v, mount: m, sub: s, replace, dist: d };
            }
          }
        }
      }
      // a tyre onto a rim lying about, a turbo onto an engine lying about
      if (sub === 'tire' || sub === 'turbo') {
        const takes = (l: Loose): boolean => !!l.part && !l.part.sub[sub] && (sub === 'tire' ? !!partDef(l.part.part).rim?.tire : !!partDef(l.part.part).engine?.turbo);
        const r = this.host.loose.pick(this.eye, this.dir, REACH, takes);
        if (r && (!best || r.dist < best.dist)) best = { kind: 'looseSub', loose: r.loose, sub, dist: r.dist };
      }
      // the ghost one aims at is under a shut lid: the lid itself is what E does (open it first)
      const g = best as Target | null;
      if (g?.kind === 'ghost') {
        const lid = g.v.view.shutOver(g.mount.id);
        const lm = lid ? g.v.view.frame.mounts.find((m) => m.id === lid) : undefined;
        const b = lm ? g.v.view.boundsOf(lm.id, this.box) : null;
        const p = b ? this.ray.intersectBox(b, this.hit) : null;
        if (lm && p && p.distanceTo(this.ray.origin) <= REACH + 0.5) return { kind: 'part', v: g.v, mount: lm, dist: p.distanceTo(this.ray.origin) };
        return g;
      }
      if (best) return best;
      // with something in the hands a door or a lid can still be opened
      this.panels(better);
    }

    const liquid = held?.kind === 'tool' ? liquidOf(held.tool) : null;
    // a spray can: the exact thing the mark is on, from its meshes; on what takes paint the buttons only
    // paint (Arctic Drive's lock: no door opens under the nozzle, nothing is picked up)
    this.paintAim = null;
    if (held?.kind === 'tool' && held.tool.kind === 'spray') {
      const a = this.host.paintCast(this.sv1.copy(this.ray.origin), this.sv2.copy(this.ray.direction), REACH);
      this.paintAim = a;
      if (a?.paintable && !(a.v && moving(a.v))) {
        // (G held still packs the can into the vehicle the mark is on)
        this.lookVehicle = a.v;
        this.scrubAim = null;
        return { kind: 'paint', aim: a, dist: a.dist };
      }
    }
    // a cleaning tool: the exact point of the part (or body) the mark is on, from its meshes
    this.scrubAim = null;
    if (held?.kind === 'tool' && cleanerOf(held.tool)) {
      this.scrubAim = this.host.grimeCast(this.sv1.copy(this.ray.origin), this.sv2.copy(this.ray.direction), REACH);
    }
    // something in the hands held into a boot, a bed, onto a seat: where it would go (a shut lid or door
    // over it: that is what E does, open it first)
    if (held) {
      const aim = this.host.cargo.aim(this.near(REACH + 1), this.ray, held, this.stowYaw);
      if (aim && !moving(aim.v)) {
        if (zoneOpen(aim.v, aim.zone)) better({ kind: 'stow', aim, dist: aim.dist + 0.02 });
        else {
          const via = this.nearestVia(aim.v, aim.zone);
          if (via) better({ kind: 'part', v: aim.v, mount: via, dist: aim.dist });
        }
      }
    }
    // things lying about: picked up into a free slot (with something in the hands too); with no slot free,
    // those that the stacks and the baskets in the hands have room for
    const free = this.freeSlot() >= 0;
    if (free || this.handsTakeIn()) {
      const r = this.host.loose.pick(this.eye, this.dir, REACH, free ? undefined : this.takesLoose);
      if (r) {
        // (the mark is on it, its card is about to be drawn: a thing that turned while it lay there is what it turned into)
        const it = r.loose.item;
        if (it && (it.fresh !== undefined || it.inside)) settleThing(it, itemNow(), false);
        // (a thing in a boot or a bed wins over the vehicle's coarse body box round it)
        better({ kind: 'loose', loose: r.loose, dist: r.loose.riding ? Math.max(0, r.dist - 1.2) : r.dist, at: r.dist });
      }
    }
    // with a can the doors and lids still open (the bonnet over the radiator and the engine); a spray can
    // off what takes paint too
    if (liquid || this.paintAim) this.panels(better, 0.05);
    let lookAt: ModVehicle | null = null;
    let lookD = Infinity;
    for (const v of this.near(REACH + 1)) {
      let onPart = false;
      // parts on vehicles (empty hands: to take off)
      if (!held) {
        for (const m of v.view.frame.mounts) {
          if (!v.build.parts[m.id]) continue;
          // (an axle's part: either of its two, at its wheels)
          const n = v.view.boundsEach(m.id, this.boxes);
          for (let k = 0; k < n; k++) {
            const p = this.ray.intersectBox(this.boxes[k], this.hit);
            if (!p) continue;
            const d = p.distanceTo(this.ray.origin);
            if (d > REACH) continue;
            onPart = true;
            better({ kind: 'part', v, mount: m, dist: d });
          }
        }
      }
      // the fillers: a can lines up with the one its liquid goes into; empty hands open and shut the flap
      if (liquid) {
        const fd = v.view.fillerHit(liquid, this.ray, REACH + 0.3);
        // (a cap one aims at on purpose, with the can for it in the hands: it wins over the boxes round it)
        if (fd !== null) better({ kind: 'filler', v, liquid, open: v.view.fillerOpen(liquid), dist: Math.max(0, fd - 1), at: fd });
      } else if (!held && v.view.hasFlap) {
        const fd = v.view.fillerHit('fuel', this.ray, REACH + 0.3);
        // (a small thing one aims at on purpose: it wins over the coarse boxes of the parts round it)
        if (fd !== null) better({ kind: 'cap', v, dist: Math.max(0, fd - 0.3), at: fd });
      }
      // the body itself: get in, or paint and wash the frame; a can anywhere else on it: where its filler is
      const d = this.bodyDist(v);
      if (d === null || d > REACH + 0.4) continue;
      if (!lookAt || d < lookD) {
        lookAt = v;
        lookD = d;
      }
      if (liquid) better({ kind: 'pour', v, dist: d + 0.3, at: d });
      // (the body's box is coarse: a part the mark is on wins, an open bonnet standing well inside it too)
      else if (!held && !onPart) better({ kind: 'enter', v, dist: d + 0.25, at: d });
    }
    this.lookVehicle = lookAt ?? (best && (best as Target).kind === 'stow' ? (best as Extract<Target, { kind: 'stow' }>).aim.v : null);
    // the tanks that are not vehicles': a jerrycan lines up with an open one, empty hands open and shut the cap
    if (liquid === 'fuel' || !held) {
      for (const port of this.host.tanks) {
        // (a pump is a tank only to a jerrycan: empty hands work it as a device, by the vehicle parked at it)
        if (port.pump && liquid !== 'fuel') continue;
        const d = port.hit(this.ray, REACH + 0.3);
        if (d !== null) better({ kind: 'tank', port, dist: Math.max(0, d - (liquid ? 1 : 0.3)), at: d });
      }
    }
    // garage devices
    for (const dv of this.host.devices) this.markDevice(dv, better);
    // … and the devices the V3 systems put in the world, the ones near where one stands (with none: nothing asked)
    const sources = this.host.interact;
    if (sources && !sources.empty) {
      const near = this.nearDevices;
      // (emptied by popping: a list cut to nothing with `length = 0` lets go of its store, and the next push allocates a new one)
      while (near.length > 0) near.pop();
      sources.near(this.eye.x, this.eye.z, REACH + 0.5, near);
      for (let i = 0; i < near.length; i++) {
        // (a system's device is its own code: one whose shape throws is reported and passed over, and the frame goes on)
        try {
          this.markDevice(near[i], better, true);
        } catch (e) {
          sources.fault(near[i], 'hit', e);
        }
      }
      while (near.length > 0) near.pop();
    }
    return best;
  }

  /** the systems' devices near, asked for every frame into the one list */
  private readonly nearDevices: GarageDevice[] = [];

  /**
   * A device offered as what the mark is on, when the mark is on it (its own shape, or its point within its
   * radius). own: it is one of a V3 system's, and the target says so.
   */
  private markDevice(dv: GarageDevice, better: (t: Target) => void, own = false): void {
    // (one with a shape of its own: a cupboard's box, a pump's)
    if (dv.hit) {
      const d = dv.hit(this.ray, REACH + 0.3);
      if (d !== null) better(own ? { kind: 'device', device: dv, dist: d, own } : { kind: 'device', device: dv, dist: d });
      return;
    }
    const dx = dv.x - this.eye.x;
    const dy = dv.y - this.eye.y;
    const dz = dv.z - this.eye.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > REACH + 0.5) return;
    const along = (dx * this.dir.x + dy * this.dir.y + dz * this.dir.z) / d;
    if (Math.sqrt(Math.max(0, 1 - along * along)) * d < dv.radius) better(own ? { kind: 'device', device: dv, dist: d, own } : { kind: 'device', device: dv, dist: d });
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
    const c = this.v3.set(sd.x - o.x, (sd.y0 + sd.y1) / 2 - o.y, sd.z - o.z);
    // the body box, turned to the vehicle's heading: test in its own frame
    const cos = Math.cos(-sd.yaw);
    const sin = Math.sin(-sd.yaw);
    const ox = this.ray.origin.x - c.x;
    const oz = this.ray.origin.z - c.z;
    const lo = this.lo.set(ox * cos - oz * sin, this.ray.origin.y - c.y, ox * sin + oz * cos);
    const ld = this.ld.set(this.ray.direction.x * cos - this.ray.direction.z * sin, this.ray.direction.y, this.ray.direction.x * sin + this.ray.direction.z * cos);
    this.hb.min.set(-sd.hx, -(sd.y1 - sd.y0) / 2, -sd.hz);
    this.hb.max.set(sd.hx, (sd.y1 - sd.y0) / 2, sd.hz);
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
    this.host.loose.highlight(t?.kind === 'loose' || t?.kind === 'looseSub' ? t.loose : null);
  }

  /** nothing lit (getting in, the walker gone) */
  clearHighlight(): void {
    this.litVehicle?.view.highlight(null);
    this.litVehicle = null;
    this.host.loose.highlight(null);
  }

  // ------------------------------------------------------------------ ghosts

  private showGhosts(): void {
    const held = this.held;
    if (held?.kind !== 'part') {
      this.ghosts.clear();
      this.ghosts.selected = '';
      return;
    }
    const def = partDef(held.inst.part);
    const sub = def.cat === 'tire' ? 'tire' : def.cat === 'turbo' ? 'turbo' : null;
    const list: GhostSpec[] = [];
    for (const v of this.near(GHOST_RANGE)) {
      const frame = v.view.frame;
      const blocked = moving(v);
      if (sub) {
        for (const m of frame.mounts) {
          const inst = v.build.parts[m.id];
          if (!inst || !subMountsOf(partDef(inst.part)).includes(sub)) continue;
          const holder = v.view.nodeOf(m.id);
          if (!holder) continue;
          // on the part's own node (already mirrored with it): a turbo at the engine's M_turbo, a tyre round the rim
          const node = sub === 'turbo' ? (holder.getObjectByName('M_turbo') ?? holder) : holder;
          const kind = blocked || v.view.shutOver(m.id) ? 'blocked' : inst.sub[sub] ? 'replace' : 'empty';
          list.push({ node, mount: null, partId: def.id, variant: sub === 'tire' ? inst.part : '', kind, key: `${v.build.uid}:${m.id}:${sub}:${def.id}` });
        }
        continue;
      }
      for (const m of mountsFor(frame, def)) {
        // (a door, a bonnet, a boot lid: its ghost is the frame's own panel there)
        const shape = def.panel ? v.view.panelShape(m.id) : null;
        const node = shape?.node ?? v.view.mountNode(m.id);
        if (!node) continue;
        const kind = blocked || v.view.shutOver(m.id) ? 'blocked' : v.build.parts[m.id] ? 'replace' : 'empty';
        list.push({ node, mount: shape ? null : m, partId: def.id, variant: frameVariant(def.id, v.view.frame), kind, key: `${v.build.uid}:${m.id}:${def.id}`, make: shape?.make });
      }
    }
    this.ghosts.show(this.showGhostsOn ? list : []);
    const t = this.target;
    this.ghosts.selected = t?.kind === 'ghost' ? `${t.v.build.uid}:${t.mount.id}:${t.sub ? `${t.sub}:` : ''}${def.id}` : '';
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

  /** E pressed on a device: the thing in the hands given to it when it takes that, else the device used (one that wants E held: by the hold) */
  private pressDevice(dv: GarageDevice): void {
    const host = this.host;
    const take = this.held && dv.take ? dv.take(this.held) : null;
    if (take) {
      if (take.ok && dv.useWith) {
        const h = this.held!;
        this.held = null;
        this.target = null;
        dv.useWith(h);
      } else host.ui.say(take.word[host.ui.lang], 2.2);
      return;
    }
    // (one held down: holdDevice)
    if (!dv.holdS) dv.use();
  }

  /** E held on a device that wants it held: its progress told, the device used when the hold is full; false: no hold on this device now */
  private holdDevice(dv: GarageDevice, held: Held, dt: number): boolean {
    if (!(dv.holdS && this.primary && !(held && dv.take?.(held)))) return false;
    if (this.spent) return true;
    this.progress += dt / dv.holdS;
    dv.holding?.(Math.min(1, this.progress));
    if (this.progress >= 1) {
      this.progress = 0;
      this.spent = true;
      dv.use();
    }
    return true;
  }

  /** a device's card, and among what the buttons would do, its line */
  private deviceWords(dv: GarageDevice, held: Held, acts: Action[]): ItemCard {
    const ui = this.host.ui;
    const card = deviceCard(dv);
    const take = held && dv.take ? dv.take(held) : null;
    if (take) acts.push({ keys: E, text: take.word[ui.lang], off: !take.ok });
    else acts.push({ keys: E, hold: !!dv.holdS, text: dv.word[ui.lang] });
    return card;
  }

  private act(dt: number, dropKey: boolean): void {
    this.lastMoved = 0;
    if (!this.primary && !this.secondary) this.spent = false;
    const t = this.target;
    const key = this.keyOf(t);
    const host = this.host;
    // the liquid stops when the buttons are let go or the can is off the filler
    const flowing = ((t?.kind === 'filler' && t.open) || (t?.kind === 'tank' && t.port.open)) && this.held?.kind === 'tool' && (this.primary || this.secondary);
    if (!flowing && this.flow) this.endFlow();
    // G held: put down what is in the hands
    if (dropKey && this.held) {
      this.dropT += dt;
      if (this.dropT >= DROP_HOLD) {
        if (!this.lookVehicle || !this.packIn(this.lookVehicle)) this.putDown();
        this.dropT = -Infinity;
      }
      return;
    }
    if (!dropKey) this.dropT = 0;

    // presses
    if (this.primaryEdge && t) {
      if (t.kind === 'loose') {
        const l = t.loose;
        const h = heldOf(l);
        const all = h.kind === 'item' ? countOf(h.item) : 1;
        const kg = partMass(h);
        const left = this.receive(h);
        // (no room for any of it: it lies where it was)
        if (left >= all) return;
        const rode = l.riding?.on as ModVehicle | undefined;
        // only part of a stack went in: the rest lies where it was, the same thing with what is left of its count
        if (left <= 0) host.loose.remove(l);
        if (rode && host.vehicles.includes(rode)) host.cargoChanged(rode);
        host.sound('pickup', left > 0 ? (kg * (all - left)) / all : kg);
        // (what the mark was on is in the hands now)
        this.target = null;
        return;
      }
      if (t.kind === 'enter' && !this.held) {
        host.enter(t.v);
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
          if (rest) host.ui.say(`${t.mount.label[host.ui.lang]}盖不严：${partDef(rest).name[host.ui.lang]}太高了。`, 3);
          return;
        }
        if (!this.held && (t.mount.cat === 'seat' || t.mount.cat === 'steering')) {
          host.enter(t.v);
          return;
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
      this.sprayDry = true;
      host.ui.say('罐子空了：丢进回收台。', 2);
    }
    // eating, drinking, taking medicine: F or the right button with it in the hands (wherever one looks)
    if (this.use) {
      this.stepUse(dt);
      return;
    }
    if (held?.kind === 'item') {
      const d = itemDef(held.item.item);
      const pressed = this.secondary && !this.secondaryWas;
      if (d.drink && this.secondary && (held.item.litres ?? 0) > 0.001) {
        this.use = { kind: 'drink', t: 0, slot: this.sel, item: held.item, dur: Infinity };
        if (!held.item.opened) {
          held.item.opened = true;
          host.sound(d.model === 'drink_soda' || d.model === 'drink_energy' ? 'can_open' : 'cap_open');
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
    // F held with a backpack in the hands (wherever one looks): on it goes
    if (held?.kind === 'item' && itemDef(held.item.item).pack && this.secondary) {
      if (this.spent) return;
      this.selectT += dt;
      this.progress = this.selectT / 0.5;
      if (this.progress >= 1) {
        this.progress = 0;
        this.selectT = 0;
        this.spent = true;
        const it = held.item;
        if (this.wearPack(it)) {
          host.sound('cloth');
          host.ui.say(`背上了${itemDef(it.item).name.zh}：快捷栏多了 ${itemDef(it.item).pack!.slots} 格。`, 2.2);
        } else host.ui.say('先把多出来那几格里的东西拿出来。', 2.2);
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
      const need = t.kind === 'looseSub' && t.sub === 'tire' ? TYRE_SWAP_S : installSeconds(partDef(held.inst.part));
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
    if (t.kind === 'part' && !held && this.secondary) {
      if (this.spent) return;
      if (moving(t.v) || t.v.view.shutOver(t.mount.id)) {
        this.progress = 0;
        return;
      }
      const need = installSeconds(partDef(t.v.build.parts[t.mount.id].part));
      this.progress += dt / need;
      if (this.progress >= 1) {
        this.progress = 0;
        this.spent = true;
        const inst = removePart(t.v.build, t.mount.id);
        if (inst) {
          this.held = { kind: 'part', inst };
          // (what the mark was on is in the hands now: the words this frame must not look for it on the mount)
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
      // a tyre off a wheel lying about, a turbo off an engine
      const sub = t.loose.part!.sub[looseSub];
      this.progress += dt / (looseSub === 'tire' ? TYRE_SWAP_S : installSeconds(partDef(sub.part)));
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
          if (this.holdDevice(t.device, held, dt)) return;
        } catch (e) {
          host.interact?.fault(t.device, 'hold', e);
          this.progress = 0;
          this.spent = true;
          return;
        }
      } else if (this.holdDevice(t.device, held, dt)) return;
    }
    if (flowing && t.kind === 'tank' && held?.kind === 'tool') {
      // (a filling station's pump: E fills the can from it, at a pump's pace; nothing goes back into it)
      if (t.port.pump && !this.primary) return;
      const dir = t.port.pump ? 'out' : this.primary ? 'in' : 'out';
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
    if (flowing && t.kind === 'filler' && held?.kind === 'tool') {
      const dir = this.primary ? 'in' : 'out';
      if (this.flow && (this.flow.dir !== dir || this.flow.v !== t.v)) this.endFlow();
      this.flow ??= { dir, v: t.v, liquid: t.liquid, moved: 0, fuel: '' };
      const moved = dir === 'in' ? pour(held.tool, t.v.build, dt) : siphon(held.tool, t.v.build, dt);
      this.lastMoved = moved;
      if (moved > 0) {
        this.flow.moved += moved;
        this.flow.fuel = held.tool.kind === 'jerrycan' ? FUEL_ZH[held.tool.fuel ?? 'petrol'] : LIQUID[t.liquid].zh;
        t.v.sys.rebuild();
        t.v.awake = 1;
        host.sound('pour', moved);
      }
      return;
    }
    // the button held on what takes paint: the coat goes on (paint.ts), the ring shows how far
    if (t.kind === 'paint' && held?.kind === 'tool' && held.tool.kind === 'spray') {
      const c = held.tool.colour ?? 0;
      const a = t.aim;
      const p = a.inst ?? a.v?.build;
      // (the ring: how far its coat of this colour is — while spraying, or one left half-done)
      const coat = p ? coatOf(p, c) : 0;
      this.progress = this.primary || (coat > 0 && coat < 1) ? coat : 0;
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
        u.item.litres = Math.max(0, (u.item.litres ?? 0) - l);
        host.drank(d.drink.liquid, l);
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
    const at = this.host.cargo.packSpot(v, held);
    if (!at) {
      this.host.ui.say(`${v.view.frame.name.zh}里放不下了。`, 2.2);
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
    this.host.ui.say(`放进了${v.view.frame.name.zh}的${at.zone.label.zh}。`, 1.8);
    return true;
  }

  /** put the held thing down in front, on whatever surface is there */
  putDown(): boolean {
    const held = this.held;
    if (!held) return false;
    if (this.flow) this.endFlow();
    const w = this.walker;
    const d = 0.8;
    const x = w.x + Math.cos(w.heading) * d;
    const z = w.z + Math.sin(w.heading) * d;
    const y = w.y + 1.0;
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
        { value: `${inZone} 件`, label: `${zone.label.zh}里` },
        { value: `${kg.toFixed(0)} kg`, label: '车里一共装了' },
      ],
      bars: [],
      notes: [{ text: '空手看着车按 Tab：看车里所有东西，点一下拿出来', tone: 'info' }],
      foot: {},
    };
  }

  /** the card of a held thing (or of one lying about); a thing's (items.ts) is the one made last time until something on it changes: do not write into it */
  cardOf(h: NonNullable<Held>): ItemCard {
    return h.kind === 'part' ? partCard(h.inst) : h.kind === 'item' ? itemCardKept(h.item, itemNow(), this.clock) : toolCard(h.tool);
  }

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
    const where = goes === 1 ? `叠到快捷栏 ${slot + 1}` : goes === 2 ? `装进${itemDef(box).name.zh}` : goes === 3 && held ? `放进快捷栏 ${slot + 1}` : '';
    const some = part > 0 ? `只拿得下 ${part} 个` : '';
    m.text = `拿起 <b>${name}</b>${where || some ? `（${where}${where && some ? '，' : ''}${some}）` : ''}`;
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
      if (sc) acts.push({ keys: ['LMB'], text: `${c.word.zh}中 · 鼠标带着${TOOL_INFO[held.tool.kind].name.zh}走，松开停下` });
      else if (this.scrubAim) acts.push((held.tool.life ?? 1) > 0 ? { keys: ['LMB'], hold: true, text: `${c.word.zh} <b>${this.scrubAim.label}</b>` } : { keys: ['LMB'], hold: true, text: `${TOOL_INFO[held.tool.kind].name.zh}用坏了`, off: true });
    }
    if (t) {
      switch (t.kind) {
        case 'loose': {
          const h = heldOf(t.loose);
          aim = this.cardOf(h);
          // where it would go, and how many of a stack: said when that is not simply the empty hands
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
          const replaced = t.sub ? (t.v.build.parts[t.mount.id]?.sub[t.sub] ?? null) : (t.v.build.parts[t.mount.id] ?? null);
          const lid = t.v.view.shutOver(t.mount.id);
          const lidName = lid ? (t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? '') : '';
          const warn = moving(t.v) ? '车在动：先停稳、拉手刹' : lid ? `${lidName}关着：看着它按 E 打开` : undefined;
          aim = this.showCardOn ? fitCard(t.v, t.mount.label[ui.lang], inst, this.compareLines(t.v, t.mount, t.sub, inst), replaced, warn) : null;
          if (moving(t.v)) acts.push({ keys: E, hold: true, text: `<b>${name(inst)}</b> · 车在动，停下再装`, off: true });
          else if (lid) acts.push({ keys: E, text: `先打开${lidName}`, off: true });
          else acts.push({ keys: E, hold: true, text: `${t.replace ? '替换' : '装上'} <b>${name(inst)}</b> · ${t.mount.label[ui.lang]}` });
          break;
        }
        case 'part': {
          const inst = t.v.build.parts[t.mount.id];
          if (!inst) break;
          aim = partCard(inst, { mount: t.mount.label[ui.lang] });
          const panel = t.v.view.hasPanel(t.mount.id);
          const seat = t.mount.cat === 'seat' || t.mount.cat === 'steering';
          if (panel) acts.push({ keys: E, text: `${t.v.view.panelOpen(t.mount.id) > 0.5 ? '关上' : '打开'} <b>${name(inst)}</b>` });
          else if (seat && !held) acts.push({ keys: E, text: `上车 <b>${t.v.view.frame.name[ui.lang]}</b>` });
          if (!held) {
            const lid = t.v.view.shutOver(t.mount.id);
            if (moving(t.v)) acts.push({ keys: F, hold: true, text: '拆下 · 车在动', off: true });
            else if (lid) acts.push({ keys: F, hold: true, text: `拆下 · 先打开${t.v.view.frame.mounts.find((m) => m.id === lid)?.label[ui.lang] ?? ''}`, off: true });
            else acts.push({ keys: F, hold: true, text: `拆下 <b>${name(inst)}</b>` });
          }
          break;
        }
        case 'filler': {
          if (held?.kind !== 'tool') break;
          const L = LIQUID[t.liquid];
          aim = this.containerCard(t.v, t.liquid);
          if (!t.open) {
            if (t.liquid === 'fuel') {
              acts.push({ keys: ['E'], text: `${L.filler}盖关着：空手按 E 打开`, off: true });
              acts.push(both ? { keys: ['G'], hold: true, text: '两只手都占着：先放下一件', off: true } : { keys: [this.sel === 0 ? '2' : '1'], text: '切到空手' });
            } else acts.push({ keys: E, text: '先打开引擎盖', off: true });
            break;
          }
          const use = toolUse(held.tool, t.v.build);
          const back = siphonUse(held.tool, t.v.build);
          acts.push(use.can ? { keys: E, hold: true, text: `${use.word[ui.lang]} · 倒进<b>${L.into}</b>` } : { keys: E, hold: true, text: `${use.word[ui.lang]}：${use.why?.[ui.lang] ?? ''}`, off: true });
          acts.push(back.can ? { keys: F, hold: true, text: `把${L.zh}抽回${TOOL_INFO[held.tool.kind].name.zh}里` } : { keys: F, hold: true, text: `抽回来：${back.why?.[ui.lang] ?? ''}`, off: true });
          if (this.flow) xfer = this.transferView(t.v, t.liquid, held.tool);
          break;
        }
        case 'pour': {
          if (held?.kind !== 'tool') break;
          const liquid = liquidOf(held.tool)!;
          const L = LIQUID[liquid];
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, text: `${L.filler}在<b>${this.fillerWhere(t.v, liquid)}</b>：对着它`, off: true });
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
          const c = held.tool.colour ?? 0;
          const colour = PALETTE[c]?.name[ui.lang] ?? '';
          const mount = a.v && a.mount ? a.v.view.frame.mounts.find((m) => m.id === a.mount) : undefined;
          aim = a.inst ? partCard(a.inst, mount ? { mount: mount.label[ui.lang] } : undefined) : a.v ? this.vehicleCard(a.v) : null;
          const p = a.inst ?? a.v?.build;
          const there = !!p && p.paint === c && !p.paintMix;
          const left = sprayLeft(held.tool);
          if (left <= 0) acts.push({ keys: E, hold: true, text: '罐子空了', off: true });
          else if (there) acts.push({ keys: E, hold: true, text: `<b>${a.label}</b> 已经是${colour}了`, off: true });
          else acts.push({ keys: E, hold: true, text: `喷漆 <b>${a.label}</b> · ${colour}` });
          // (the paint is its colour, not a coat over the dirt: a dirty thing painted stays dirty)
          const dirty = p ? Math.max(p.dirt, p.crust ?? 0, p.rust) : 0;
          if (left > 0 && !there && dirty > 0.35) acts.push({ keys: ['LMB'], text: '脏东西和锈盖不住：先刮干净再喷', off: true });
          break;
        }
        case 'enter':
          aim = this.vehicleCard(t.v);
          acts.push({ keys: E, text: `上车 <b>${t.v.view.frame.name[ui.lang]}</b>` });
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
            const why = has && has !== pf ? `油桶里是${FUEL_ZH[has]}，这台是${FUEL_ZH[pf]}` : (p.tank.fuel[pf] ?? 0) <= 0.01 ? '加油机没油了' : (u.why?.[ui.lang] ?? '');
            acts.push(u.can ? { keys: E, hold: true, text: `灌${FUEL_ZH[pf]} · 从<b>${p.name}</b>灌进油桶` } : { keys: E, hold: true, text: `灌油：${why}`, off: true });
            if (this.flow?.port === p) xfer = this.tankTransfer(p, held.tool);
            break;
          }
          if (!p.open) {
            acts.push({ keys: ['E'], text: '油箱盖拧着：空手按 E 拧开', off: true });
            acts.push(both ? { keys: ['G'], hold: true, text: '两只手都占着：先放下一件', off: true } : { keys: [this.sel === 0 ? '2' : '1'], text: '切到空手' });
            break;
          }
          const u = tankUse(held.tool, p.tank);
          acts.push(u.in.can ? { keys: E, hold: true, text: `加${FUEL_ZH[held.tool.fuel ?? 'petrol']} · 倒进<b>${p.name}</b>` } : { keys: E, hold: true, text: `加油：${u.in.why?.[ui.lang] ?? ''}`, off: true });
          acts.push(u.out.can ? { keys: F, hold: true, text: '把油抽回油桶里' } : { keys: F, hold: true, text: `抽回来：${u.out.why?.[ui.lang] ?? ''}`, off: true });
          if (this.flow?.port === p) xfer = this.tankTransfer(p, held.tool);
          break;
        }
        case 'stow': {
          const { v, zone, spot, why } = t.aim;
          aim = this.zoneCard(v, zone);
          if (spot && held) acts.push({ keys: E, text: `放进${zone.label.zh} <b>${heldName(held)}</b>` }, { keys: ['Wheel'], text: '转一转方向' });
          else acts.push({ keys: E, text: why || `${zone.label.zh}放不下`, off: true });
          break;
        }
      }
    }
    // a spray can off what takes paint: what the mark is on does not
    if (held?.kind === 'tool' && held.tool.kind === 'spray' && t?.kind !== 'paint' && this.paintAim && !this.paintAim.paintable && acts.length === 0) acts.push({ keys: E, hold: true, text: `<b>${this.paintAim.label}</b> 不能喷漆`, off: true });
    if (held && this.lookVehicle && t?.kind !== 'stow' && t?.kind !== 'ghost' && t?.kind !== 'filler' && t?.kind !== 'paint') acts.push({ keys: ['G'], hold: true, text: `收进${this.lookVehicle.view.frame.name.zh}里` });
    // (the card only for what is close by: from further off it would stand in the way of the view)
    if (aim && t && (t.at ?? t.dist) > CARD_NEAR) aim = null;
    if (t?.kind === 'loose' && noRoom) acts.splice(0, acts.length, { keys: ['G'], hold: true, text: '两只手都占着：先放下一件', off: true });
    if (this.dropT > 0 && held) acts.splice(0, acts.length, { keys: ['G'], hold: true, text: this.lookVehicle ? `收进${this.lookVehicle.view.frame.name.zh}里 <b>${heldName(held)}</b>` : `放下 <b>${heldName(held)}</b>` });
    // (while liquid flows the strip saying from what into what stands where these words are)
    if (xfer) acts.length = 0;
    const ring = this.dropT > 0 && held ? Math.min(1, this.dropT / DROP_HOLD) : this.progress > 0 ? this.progress : -1;
    ui.prompt(!this.scrub, '', ring);
    const items = ui.items;
    items.showActions(acts);
    items.showCards(held ? this.cardOf(held) : null, aim, this.cardsOn);
    items.showKeys(this.heldKeys());
    items.showTransfer(xfer);
    items.showHotbar(this.slotViews(), this.sel);
  }

  /** what liquid goes from what into what, with how much is in each */
  private transferView(v: ModVehicle, liquid: LiquidKind, tool: Tool): TransferView {
    const L = LIQUID[liquid];
    const info = TOOL_INFO[tool.kind];
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

  /** every action of the thing in the hands (down the right) */
  private heldKeys(): Action[] {
    const h = this.held;
    const out: Action[] = [];
    const other = this.slots[1 - this.sel];
    if (!h) {
      out.push({ keys: E, text: '拿起 / 开关 / 上车' }, { keys: F, hold: true, text: '拆下零件' });
    } else if (h.kind === 'tool') {
      const liquid = liquidOf(h.tool);
      if (liquid) {
        const L = LIQUID[liquid];
        out.push({ keys: E, hold: true, text: `${liquid === 'fuel' ? '加油' : liquid === 'water' ? '加水' : '加机油'}（对着${L.filler}）` });
        out.push({ keys: F, hold: true, text: `把${L.zh}抽回来` });
      } else if (h.tool.kind === 'spray') out.push(sprayLeft(h.tool) > 0 ? { keys: E, hold: true, text: '喷漆（对着车身、车门、引擎盖、尾门、保险杠、后视镜）' } : { keys: E, hold: true, text: '罐子空了', off: true });
      else {
        const c = cleanerOf(h.tool);
        if (c && (h.tool.life ?? 1) <= 0) out.push({ keys: ['LMB'], hold: true, text: `${TOOL_INFO[h.tool.kind].name.zh}用坏了`, off: true });
        else if (c) out.push({ keys: ['LMB'], hold: true, text: `${c.word.zh}（对着车身、零件；鼠标带着走）` }, { keys: ['H'], text: '看看哪里还脏' });
      }
    } else if (h.kind === 'item' && itemDef(h.item.item).pack) {
      out.push({ keys: F, hold: true, text: `背上（快捷栏 +${itemDef(h.item.item).pack!.slots} 格）` });
    } else if (h.kind === 'item') {
      const d = itemDef(h.item.item);
      if (d.drink) out.push((h.item.litres ?? 0) > 0.001 ? { keys: F, hold: true, text: '喝' } : { keys: F, hold: true, text: '空了', off: true });
      else if (d.eat) out.push({ keys: F, text: d.cat === 'med' ? '吃药' : countOf(h.item) > 1 ? '吃一个' : '吃掉' });
      else if (d.revive) out.push({ keys: F, text: '倒下时自己用上', off: true });
    }
    if (h) out.push({ keys: ['G'], hold: true, text: '放下（看着车：收进车里）' });
    // (a part goes where its ghost lights up: the line over the hotbar says so when it is aimed)
    if (h || other) out.push({ keys: [this.sel === 0 ? '2' : '1'], text: other ? `换成${other.kind === 'part' ? partDef(other.inst.part).name.zh : other.kind === 'item' ? itemDef(other.item.item).name.zh : TOOL_INFO[other.tool.kind].name.zh}` : '空出手' });
    out.push({ keys: ['I'], text: this.cardsOn ? '隐藏物品信息' : '显示物品信息' });
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
      const fill = spray ?? (t && liquid ? { value: t.litres ?? 0, max: TOOL_INFO[t.kind].capacity, tone: (t.kind === 'jerrycan' ? (t.fuel ?? 'petrol') : LIQUID[liquid].tone) as Tone } : drink && h.kind === 'item' ? { value: h.item.litres ?? 0, max: drink.litres, tone: (drink.liquid === 'water' ? 'water' : drink.liquid === 'alcohol' ? 'mix2t' : 'charge') as Tone } : undefined);
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

function partMass(h: Held): number {
  if (!h) return 0;
  if (h.kind === 'part') return partDef(h.inst.part).mass;
  if (h.kind === 'item') return itemMass(h.item);
  return h.tool.kind === 'jerrycan' ? 4 + (h.tool.litres ?? 0) * 0.75 : 1;
}

export { TOOL_INFO };
