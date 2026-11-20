/**
 * The crowns' growth client (docs/V3/nodes/P3-variant-packs.md): a species' variants asked for and given back later,
 * grown in scene/crowns/crownGrowWorker.ts. Eight variants at three levels are some tens of milliseconds: on the main
 * thread that was a frame of its own each time a new kind of tree came into view. If workers cannot be had, it is
 * done here, between frames.
 */
import { fromArrays, growOne, growSpecies, grownFromArrays, type GeometryArrays, type GrownArrays, type GrownSpecies, type OneTree } from './speciesGrow';
import { VARIANTS } from './species';

export interface Grown {
  species: GrownSpecies;
  /** how long the growing took (ms, in the worker or here) */
  ms: number;
  inWorker: boolean;
}

let worker: Worker | null | undefined;
const waiting = new Map<number, (g: Grown | null) => void>();
const waitingOne = new Map<number, (g: OneTree | null) => void>();
let nextId = 1;

function growWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./crownGrowWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; grown?: GrownArrays | null; one?: { near: GeometryArrays; shadow: GeometryArrays } | null; ms: number }>) => {
      if (e.data.one !== undefined) {
        const one = waitingOne.get(e.data.id);
        waitingOne.delete(e.data.id);
        one?.(e.data.one ? { near: fromArrays(e.data.one.near), shadow: fromArrays(e.data.one.shadow) } : null);
        return;
      }
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.grown ? { species: grownFromArrays(e.data.grown), ms: e.data.ms, inWorker: true } : null);
    };
    worker.onerror = () => {
      // (gone: whatever was waiting is grown here instead)
      const left = [...waiting.values()];
      const ones = [...waitingOne.values()];
      waiting.clear();
      waitingOne.clear();
      worker?.terminate();
      worker = null;
      for (const done of left) done(null);
      for (const done of ones) done(null);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** a species grown now, here (the harness's stepped frames, and wherever no worker can be had) */
export function growNow(family: string, kit: boolean, n = VARIANTS): Grown {
  const start = performance.now();
  const species = growSpecies(family, kit, n);
  return { species, ms: performance.now() - start, inWorker: false };
}

/** one tree grown as itself (speciesGrow.ts growOne), in the worker; null if it could not be */
export function growOneLater(family: string, kit: boolean, seed: number): Promise<OneTree | null> {
  const w = growWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(growOne(family, kit, seed)), 0));
  const id = nextId++;
  return new Promise((resolve) => {
    waitingOne.set(id, resolve);
    w.postMessage({ id, family, kit, n: 0, one: seed });
  });
}

/** a species grown in the worker; null if it could not be (the caller grows it then: growNow) */
export function growLater(family: string, kit: boolean, n = VARIANTS): Promise<Grown | null> {
  const w = growWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(growNow(family, kit, n)), 0));
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, family, kit, n });
  });
}
