/**
 * The far pictures' client (docs/V3/nodes/P3-bake-worker.md): a crown model's far picture asked for and given back
 * later, baked in scene/crowns/crownBakeWorker.ts. A bake is some ten milliseconds of the CPU: on the main thread
 * it lengthened the frame it fell in each time a new kind of tree came into the far band. If workers cannot be had,
 * it is done here, one between frames.
 */
import type * as THREE from 'three';
import { bakeCrown, type CrownAtlas } from './crownAtlas';
import { floraCover, floraCoverMask } from '../flora/atlas';

export interface Baked {
  atlas: CrownAtlas;
  /** how long the bake itself took (ms, in the worker or here) */
  ms: number;
  /** baked in the worker */
  inWorker: boolean;
}

/** what a bake reads of a crown model */
const NEEDS = ['position', 'normal', 'uv', 'aCrown', 'aPart'] as const;

let worker: Worker | null | undefined;
let kitSent = false;
const waiting = new Map<number, (b: Baked | null) => void>();
let nextId = 1;

function bakeWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./crownBakeWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; atlas: CrownAtlas | null; ms: number }>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.atlas ? { atlas: e.data.atlas, ms: e.data.ms, inWorker: true } : null);
    };
    worker.onerror = () => {
      // (gone: whatever was waiting is baked here instead)
      const left = [...waiting.values()];
      waiting.clear();
      worker?.terminate();
      worker = null;
      for (const done of left) done(null);
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** a far picture baked now, here (the harness's stepped frames: render/entry ?shot, and wherever no worker can be had) */
export function bakeNow(model: THREE.BufferGeometry, kit: boolean): Baked {
  const start = performance.now();
  const atlas = bakeCrown(model, kit ? floraCover() : undefined);
  return { atlas, ms: performance.now() - start, inWorker: false };
}

/** a crown model's far picture, baked in the worker; null if it could not be (the caller bakes it then: bakeNow) */
export function bakeLater(model: THREE.BufferGeometry, kit: boolean): Promise<Baked | null> {
  const w = bakeWorker();
  if (!w) return new Promise((resolve) => setTimeout(() => resolve(bakeNow(model, kit)), 0));
  if (kit && !kitSent) {
    // (the toolkit's foliage mask, once: every kit bake reads it)
    const m = floraCoverMask();
    w.postMessage({ id: 0, mask: m.mask.slice(), px: m.px });
    kitSent = true;
  }
  // (copies: the model stays the draw's, to bake again should its picture be let go)
  const attributes = NEEDS.map((name) => {
    const a = model.getAttribute(name) as THREE.BufferAttribute;
    const flat = a.array instanceof Float32Array && !a.normalized && a.array.length === a.count * a.itemSize;
    const array = flat ? (a.array as Float32Array).slice() : Float32Array.from({ length: a.count * a.itemSize }, (_, k) => a.getComponent(Math.floor(k / a.itemSize), k % a.itemSize));
    return { name, array, itemSize: a.itemSize };
  });
  const index = new Uint32Array(model.getIndex()!.array as ArrayLike<number>);
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    w.postMessage({ id, attributes, index, kit }, [...attributes.map((a) => a.array.buffer), index.buffer]);
  });
}
