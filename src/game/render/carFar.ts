/**
 * The far models' client (render/farSimplify.ts does the work, in render/farWorker.ts): a merged mesh's reduced
 * index asked for and given back later. If workers cannot be had, it is done here, one mesh at a time between
 * frames.
 */
import type * as THREE from 'three';
import { FAR_ERROR, reduceIndex, simplifierReady } from './farSimplify';

let worker: Worker | null | undefined;
const waiting = new Map<number, (ix: Uint32Array | null) => void>();
let nextId = 1;

function farWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./farWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; indices: Uint32Array }>) => {
      const done = waiting.get(e.data.id);
      waiting.delete(e.data.id);
      done?.(e.data.indices.length >= 3 ? e.data.indices : null);
    };
    worker.onerror = () => {
      // (gone: whatever was waiting gets nothing, and the rest is done here)
      for (const done of waiting.values()) done(null);
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  } catch {
    worker = null;
  }
  return worker;
}

/** a mesh's index reduced to about `share` of its triangles within `error` (a share of its size); null if it could not be */
export function reduceLater(geometry: THREE.BufferGeometry, share: number, error = FAR_ERROR, prune = true): Promise<Uint32Array | null> {
  const pos = geometry.getAttribute('position');
  const ix = geometry.getIndex();
  if (!pos || !ix || share >= 1) return Promise.resolve(null);
  const positions = new Float32Array(pos.array as ArrayLike<number>);
  const indices = new Uint32Array(ix.array as ArrayLike<number>);
  const w = farWorker();
  if (w) {
    const id = nextId++;
    return new Promise((resolve) => {
      waiting.set(id, resolve);
      w.postMessage({ id, positions, indices, share, error, prune }, [positions.buffer, indices.buffer]);
    });
  }
  return simplifierReady().then(
    () =>
      new Promise((resolve) => {
        setTimeout(() => {
          try {
            resolve(reduceIndex(positions, indices, share, error, prune));
          } catch {
            resolve(null);
          }
        }, 0);
      }),
  );
}
