/// <reference types="vite/types/importMeta.d.ts" />
/**
 * The modules of the V3 kernel (docs/V3/nodes/N0-foundation.md): a gameplay system is a folder,
 * src/game/modcar/v3/<system>/, whose index.ts has a `GameModule` as its default export. The game finds every
 * such folder by itself (the bundler lists them here at build time), so adding a system adds no line to any
 * shared file.
 *
 * Two things happen to a module, at two times:
 *
 *   - It is imported, with everything it imports, when this file is — before the page's entry runs, so before
 *     the save is read. Content a module registers at its top level (items it adds to the catalogue) is
 *     therefore known when the save is checked.
 *   - It is installed into the game (`installModules`) when the game is constructed: its systems, save slices,
 *     interactable sources and developer tabs are registered, then its `setup` is called.
 *
 * Modules are taken in the order of their ids, whatever the file system says.
 */
import type { SaveSlice } from '../../../core/kernel/slices';
import type { System } from '../../../core/kernel/systems';
import type { GameContext } from './context';
import type { DevTab } from './devTabs';
import type { InteractSource } from './interact';

export interface GameModule {
  /** unique among the modules: lower-case letters, digits, '_' and '-' (by convention the folder's name) */
  readonly id: string;
  readonly systems?: readonly System<GameContext>[];
  // (each slice has its own data type, which only it reads)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly slices?: readonly SaveSlice<any>[];
  readonly interact?: readonly InteractSource[];
  readonly devTabs?: readonly DevTab[];
  /**
   * Called once when the game is constructed, after the lists above are registered: subscribe to events, or
   * register by hand what depends on the game. The vehicles and the things lying about are not there yet
   * (a system's `init` runs when they are).
   */
  setup?(ctx: GameContext): void;
}

const ID = /^[a-z][a-z0-9_-]*$/;

/**
 * The modules among what the bundler found (file → what the file exports), in the order of their ids. Throws
 * when a file's default export is not a module, or when two modules have the same id.
 */
export function collectModules(found: Record<string, unknown>): GameModule[] {
  const from = new Map<string, string>();
  const out: GameModule[] = [];
  for (const file of Object.keys(found).sort()) {
    const m = (found[file] as { default?: unknown } | null)?.default as GameModule | undefined;
    if (typeof m !== 'object' || m === null || typeof m.id !== 'string' || !ID.test(m.id)) {
      throw new Error(`${file} must export a GameModule as its default: an object with an id of lower-case letters, digits, _ and -`);
    }
    const other = from.get(m.id);
    if (other !== undefined) throw new Error(`two modules have the id '${m.id}': ${other} and ${file}`);
    from.set(m.id, file);
    out.push(m);
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** every module there is, found when this file is imported */
export const MODULES: readonly GameModule[] = collectModules(import.meta.glob('../v3/*/index.ts', { eager: true }));

/**
 * Register what each module brings, in order. A module that throws is reported and the next is still
 * installed (what it had registered before it threw stays).
 */
export function installModules(modules: readonly GameModule[], ctx: GameContext, onError: (id: string, error: unknown) => void): void {
  for (const m of modules) {
    try {
      for (const s of m.systems ?? []) ctx.systems.add(s);
      for (const s of m.slices ?? []) ctx.slices.register(s);
      for (const s of m.interact ?? []) ctx.interact.add(s);
      for (const t of m.devTabs ?? []) ctx.devTabs.add(t);
      m.setup?.(ctx);
    } catch (error) {
      onError(m.id, error);
    }
  }
}
