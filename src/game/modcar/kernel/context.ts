/**
 * The game as a V3 system sees it (docs/V3/nodes/N0-foundation.md): `GameContext` is the one object handed to a
 * module's `setup` and to every hook of a system. It is the game itself (ModGame implements it), narrowed to
 * what systems are meant to use: the kernel's registries and the few parts of the game the first system needs.
 *
 * It is small on purpose. A later node that needs more of the game adds a member here; when ModGame already has
 * a public member of that name and type, nothing else changes.
 *
 * Read `world` and `seated` each time they are needed, never keep them: the world is null in the stand-in
 * garage until one drives out, and the seat changes.
 *
 * Two things about time that a system's author would otherwise have to guess:
 *
 *   - The environment is first brought up to date in the first frame, between `step` and `lateUpdate`. In
 *     `setup`, in `init` and in the first frame's `preStep` and `step`, `env.sky` and `env.state` are still what
 *     the environment was made with (noon, and the weather's first state), not the hour and the weather of the
 *     game. `clock` is right from the start: before the first `lateUpdate`, read the hour from `clock.hour`.
 *   - A hook is never handed negative seconds, though the game's own first frame can be a step of them (its
 *     loop's first time stamp may lie before the time the loop was started at): the hooks are then handed none.
 *     Every other part of the game, `env` among them, is stepped back by that little all the same, once.
 *
 * This file also declares the events the game itself emits (the list is open: core/kernel/events.ts).
 */
import type { EventBus, GameEvents, NoPayload } from '../../../core/kernel/events';
import type { SaveSliceRegistry } from '../../../core/kernel/slices';
import type { SystemRegistry } from '../../../core/kernel/systems';
import type { WorldTime } from '../../../core/kernel/clock';
import type { DrinkLiquid, ItemInstance } from '../../../core/modcar/items';
import type { Buffs } from '../../../core/v3/cooking/buffs';
import type { Vitals } from '../../../core/modcar/vitals';
import type { World } from '../../../core/world/terrain';
import type { SolidSource } from '../../../core/world/solids';
import type { Environment } from '../../env/environment';
import type { RenderCore } from '../../render/core';
import type { CargoBay } from '../cargo';
import type { CockpitUse } from '../cockpit';
import type { MountDef } from '../../../core/modcar/types';
import type { HeldThing } from '../held';
import type { ScrubHit } from '../player';
import type { Cleaner, Tool } from '../../../core/modcar/tools';
import type * as THREE from 'three';
import type { Loose, LooseThings } from '../loose';
import type { ModParams } from '../ModGame';
import type { ModPlayer } from '../player';
import type { ModUI } from '../ui';
import type { ModVehicle } from '../vehicle';
import type { DevTabs } from './devTabs';
import type { InteractSources } from './interact';

/** what feeds a thing lying about or riding in a vehicle (GameContext.powerAt; null: not in a vehicle, or no power module) */
export function powerOf(ctx: GameContext, l: Loose): 'on' | 'flat' | null {
  for (const f of ctx.powerAt ?? []) {
    const p = f(l);
    if (p !== undefined) return p;
  }
  return null;
}

export interface GameContext {
  // ---------------------------------------------------------------- the kernel
  /** what happened, said and heard (core/kernel/events.ts) */
  readonly events: EventBus<GameEvents>;
  /** the systems and their hooks in the frame (core/kernel/systems.ts) */
  readonly systems: SystemRegistry<GameContext>;
  /** each system's part of the save (core/kernel/slices.ts) */
  readonly slices: SaveSliceRegistry;
  /** the world's time: saved, never backwards; right from `setup` on (core/kernel/clock.ts) */
  readonly clock: WorldTime;
  /** things in the world the mark finds and E works (interact.ts) */
  readonly interact: InteractSources;
  /** tabs of the developer's panel (devTabs.ts) */
  readonly devTabs: DevTabs;

  // ---------------------------------------------------------------- the game
  /** what the address asked for: the world's seed, screenshots (`shot`), whether this is the player's kept game (`keep`) */
  readonly params: ModParams;
  /** the renderer: the scene, the camera, the floating origin (place things with `core.place`, in lateUpdate) */
  readonly core: RenderCore;
  /**
   * the game's sound: its context once started, and the master bus a system's own voices join (its volume, its mute:
   * docs/ND/PLAN.md; docs/V3/plan/fishing.md: the line's whine following its strain). Both null until the page has been
   * clicked (browsers start sound then); absent in the tests
   */
  readonly audio?: { readonly context: AudioContext | null; readonly output: AudioNode | null };
  /** the hour's light and the weather (`env.sky`, `env.state`): during preStep and step still last frame's, and before the first frame's lateUpdate not yet the game's at all (see above) */
  readonly env: Environment;
  /** the world; null in the stand-in garage until one drives out */
  readonly world: World | null;
  /** the player on foot: the walker, the hands, what the mark is on */
  readonly player: ModPlayer;
  /** how far between its last two physics steps the vehicle sat in is drawn this frame (0 … 1; its view's interpolation) */
  readonly renderAlpha?: number;
  /** a vehicle of the world's (a find) made one's own (wrecks.ts claim); absent: nothing to do */
  claimVehicle?(v: ModVehicle): void;
  /** the systems' rules against starting an engine (the key turned: a rule's why stops it — the Turtle's roof up); push to add one */
  readonly startBlockers?: ((v: ModVehicle) => { zh: string; en: string } | null)[];
  /** lie down in a bed and sleep (the camper's): the night gone by as in a seat, rested sooner; why not, or null when it begins */
  sleepInBed?(): { zh: string; en: string } | null;
  /** what one has learnt to make at a bench (recipe ids: docs/V3/plan/finish.md §六 2); absent in the tests */
  readonly learned?: ReadonlySet<string>;
  /** a making learnt from its blueprint, for good (true: new; false: known already) */
  learn?(recipe: string): boolean;
  /**
   * Is this thing kept back for now — a piece of a set whose earlier pieces have not been picked up yet (core/modcar/
   * kits.ts, docs/V3/plan/finish.md §二 3: a chest's key before the metal detector)? Its key: an item's id, `part:`
   * and a part's. A system that lays things about of its own asks before it does; absent in the tests: nothing is.
   */
  withheld?(key: string): boolean;
  /**
   * What feeds an electric thing riding in a vehicle (docs/V3/plan/rv.md R2, the power module): 'on' — its house battery,
   * or with none the starter's above what it keeps to crank on, has charge; 'flat' — nothing there to draw on; null —
   * not in a vehicle (an appliance works there as it always has; a hob does not heat). The list is the game's: a system
   * pushes its answer; the first that is not undefined holds (powerOf).
   */
  readonly powerAt?: ((l: Loose) => 'on' | 'flat' | null | undefined)[];
  /** the body: health, food, water, warmth (core/modcar/vitals.ts): a meal feeds it through `eat` */
  readonly body: Vitals;
  /** what a good meal leaves behind for a while (core/v3/cooking/buffs.ts): granted with add, read by the body each step */
  readonly buffs?: Buffs;
  /** every vehicle there now, the live wrecks by the road among them */
  readonly vehicles: readonly ModVehicle[];
  /** the vehicle the player sits in; null on foot */
  readonly seated: ModVehicle | null;
  /** the things lying about */
  readonly loose: LooseThings;
  /** what rides in the vehicles, and where a thing would go in one (cargo.ts) */
  readonly cargo: CargoBay;
  /** the words on screen: the toast, the cards */
  readonly ui: ModUI;
  /**
   * A sound of the game's own by its name ('pickup', 'putdown', 'bite' …: ModGame.sound; any of foley.ts FOLEY_SHOTS;
   * 'loot_reveal_1' … 'loot_reveal_5' the reveal by stars; a name only the sound archive has, its recording when the archive
   * is there); `gain`: how loud, or for the two that carry a weight, the kilograms
   */
  sound(name: string, gain?: number): void;
  /**
   * A loop of the game's own (foley.ts FOLEY_LOOPS: the kitchen's flame, a pan frying, a pot on the boil …) kept going this
   * frame at `gain` (its level glides there): asked for every frame it should sound; not asked, it fades out. One of each
   * kind plays at a time: a system with several of them asks for the loudest.
   */
  loop(name: string, gain?: number): void;
  /** a sound made ready before it is first wanted (rendered, its recording fetched): its first play is then neither late nor silent */
  warmSound(name: string): void;
  /** a page of the Tab screen (TabPage): returns the function that takes it out again; absent: no Tab screen (the tests' stand-in games) */
  addTabPage?(page: TabPage): () => void;
  /** from a page of the Tab screen: on to the next (1) or back (−1: before the first, the lists again) */
  turnTab?(dir: -1 | 1): void;
  /** the Tab screen open on that page (the lists shut) */
  openTab?(id: string): void;
  /** the Tab screen shut, whatever of it is open */
  closeTab?(): void;
  /**
   * The developer's teleport (for a system's developer's tab: docs/V3/plan/fishing.md, off to a water): on foot one
   * stands at (x, z) facing `yaw` — the vehicles' heading, forward (cos yaw, −sin yaw): a walker's heading h is
   * yaw −h — the vehicle one sits in coming along (on foot: the one last driven, with `bring`); the world round it is
   * built behind a fade. Out of the garage first, when one is in it.
   */
  teleportTo(x: number, z: number, yaw: number, bring: boolean): void;
  /**
   * A system's sets that play the radio's songs where they stand (docs/V3/nodes/M2-rv.md: a clock radio on a
   * table, a record player): the list is the system's own, kept up to date by it every frame (those in it play);
   * the game hears the loudest of everything playing, the car radios among it. Returns the function that takes
   * the list out again.
   */
  addRadios(sets: readonly RadioSet[]): () => void;
  /**
   * A system's share of each vehicle radio's loudness, asked every frame for each one playing (docs/ND/PLAN.md: the
   * tape deck's volume knob; 0 while a tape plays in it, the station quiet). The list is the game's: push to it.
   */
  readonly radioLevel: ((v: ModVehicle) => number)[];
  /** the cab's controls from a seat (cockpit.ts): the one the mark is on; the systems' own ways with them (push to `uses`) */
  readonly cockpit: { readonly uses: CockpitUse[]; readonly aimed: MountDef | null };
  /**
   * A system's own solids (docs/ND/PLAN.md: a prefab building's doors while they are shut): the walker and the
   * vehicles keep out of what it offers from then on. Returns the function that takes it out again.
   */
  addSolids(s: SolidSource): () => void;
  /** the thing in the hands as drawn in first person (held.ts): raised to the eye (`lift`), something hung on it (`hang`) */
  readonly heldThing: HeldThing;
  /** the view on foot zoomed this many times (a camera raised to the eye: docs/ND/PLAN.md); 1 none. The system that set it sets it back */
  lookZoom: number;
  /**
   * The view's turn and tilt as the mouse and the stick make them (rad: `lookYaw` the heading on the plan, as a
   * walker's; `lookPitch` up +). A system that holds the view (a seat: docs/ND/PLAN.md) keeps them within its limits.
   * `walk`: the walking stick as the keys and the pad make it (forward and right, −1 … 1: a ladder climbed with it,
   * docs/ND/PLAN.md ND6); `isDown`: a key held (its code).
   */
  readonly input: { lookYaw: number; lookPitch: number; readonly walk: { readonly forward: number; readonly right: number }; isDown(code: string): boolean };
  /**
   * The grime on what the line of sight meets (a vehicle's body or part, a part lying about; render space), null none
   * within `far`; a stroke of a tool over it from a to b (the masks: grime.ts), and the stroke ended (measured). The
   * scrubbing the game does with its own tools, for a system's tool (docs/ND/PLAN.md: the grinder).
   */
  grimeCast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): ScrubHit | null;
  scrubStroke(hit: ScrubHit, a: THREE.Vector3, b: THREE.Vector3, side: THREE.Vector3, tool: Tool, c: Cleaner, dt: number): void;
  scrubEnd(last: ScrubHit | null, tool: Tool): void;
}

/** a set playing one of the radio's songs where it stands (GameContext.addRadios) */
/**
 * A page of the Tab screen beside the lists (docs/V3/plan/finish.md §十三, §十四: Tab is "what have I" — the lists, the
 * recipes, the compendium): a system's own screen, turned to from the lists with D and back with A. While it is open
 * the game stands still as with a list; the wheel and the left button are handed to it; the right button, Esc and Tab
 * shut the Tab screen.
 */
export interface TabPage {
  readonly id: string;
  /** its name in the lists' foot and on its own strip ("菜谱") */
  readonly title: string;
  /** opened or shut */
  show(open: boolean): void;
  /** the wheel turned a notch over it (1 down, −1 up) */
  wheel?(dir: 1 | -1): void;
  /** the left button pressed over it */
  press?(): void;
}

export interface RadioSet {
  /** where it stands (world metres) */
  x: number;
  y: number;
  z: number;
  /** which song (radio.ts SONGS) */
  song: number;
  /** how loud, against a car radio's 1 */
  loud: number;
  /** in a vehicle (its living space, its cab): heard through its walls from outside, as a car radio is */
  inside: ModVehicle | null;
}

declare module '../../../core/kernel/events' {
  interface GameEvents {
    /**
     * A new game: the slices are as a new game starts and the world's clock is at nothing. Emitted once the
     * systems are set up on a page that read no save (a test page too), and again when the player asks for a
     * new game — just before the page is opened afresh, where it is emitted as the first case.
     */
    'game:new': NoPayload;
    /** a game in progress was taken up: the systems are set up and every slice has been restored from the save */
    'game:restored': NoPayload;
    /** something was eaten or taken (food, a pill); the item is gone from the hands */
    'body:ate': { readonly item: ItemInstance };
    /**
     * Some of a drink went down: emitted every frame while it flows, with that frame's litres. The payload
     * object is reused from one to the next: read it during the call, do not keep it.
     */
    'body:drank': { readonly liquid: DrinkLiquid; readonly litres: number };
  }
}
