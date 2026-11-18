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
import type { ItemInstance } from '../../../core/modcar/items';
import type { World } from '../../../core/world/terrain';
import type { Environment } from '../../env/environment';
import type { RenderCore } from '../../render/core';
import type { LooseThings } from '../loose';
import type { ModParams } from '../ModGame';
import type { ModPlayer } from '../player';
import type { ModUI } from '../ui';
import type { ModVehicle } from '../vehicle';
import type { DevTabs } from './devTabs';
import type { InteractSources } from './interact';

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
  /** the hour's light and the weather (`env.sky`, `env.state`): during preStep and step still last frame's, and before the first frame's lateUpdate not yet the game's at all (see above) */
  readonly env: Environment;
  /** the world; null in the stand-in garage until one drives out */
  readonly world: World | null;
  /** the player on foot: the walker, the hands, what the mark is on */
  readonly player: ModPlayer;
  /** every vehicle there now, the live wrecks by the road among them */
  readonly vehicles: readonly ModVehicle[];
  /** the vehicle the player sits in; null on foot */
  readonly seated: ModVehicle | null;
  /** the things lying about */
  readonly loose: LooseThings;
  /** the words on screen: the toast, the cards */
  readonly ui: ModUI;
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
    'body:drank': { readonly liquid: 'water' | 'alcohol' | 'energy'; readonly litres: number };
  }
}
