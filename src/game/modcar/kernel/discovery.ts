/// <reference types="vite/types/importMeta.d.ts" />
/**
 * Where the V3 modules are found (docs/V3/nodes/N0-foundation.md): every folder src/game/modcar/v3/<system>/
 * whose index.ts has a `GameModule` as its default export, listed here by the bundler at build time, so adding
 * a system adds no line to any shared file.
 *
 * This file is imported by the page's entry alone (entry.ts), as the first thing that concerns the game: every
 * module, with everything it imports, is evaluated when this file is — before the entry's own code runs, so
 * before the save is read. Content a module registers at its top level (items it adds to the catalogue) is
 * therefore known when the save is checked.
 *
 * It stands apart from kernel/modules.ts because `import.meta.glob` only exists under the bundler: whatever
 * imports this file cannot run in plain Node, and evaluates every real module. The rest of the kernel, and the
 * tests' stand-in for the game, import modules.ts and so do neither.
 */
import { collectModules, type GameModule } from './modules';

/** every module there is, in the order of their ids, found when this file is imported */
export const MODULES: readonly GameModule[] = collectModules(import.meta.glob('../v3/*/index.ts', { eager: true }));
