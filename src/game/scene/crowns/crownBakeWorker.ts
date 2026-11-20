/**
 * The far pictures' worker (scene/crowns/crownAtlas.ts bakes, scene/crowns/crownBake.ts asks): takes a crown model's
 * arrays — and once, the plant toolkit's foliage mask — and gives back its far picture. One job at a time, in the
 * order they came.
 */
import * as THREE from 'three';
import { bakeCrown, maskCover } from './crownAtlas';

interface Job {
  id: number;
  attributes: { name: string; array: Float32Array; itemSize: number }[];
  index: Uint32Array;
  /** baked against the plant toolkit's mask (sent before, in a job of its own) */
  kit: boolean;
  mask?: Uint8Array;
  px?: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };
let kitCover: ((u: number, v: number) => boolean) | undefined;

ctx.onmessage = (e) => {
  const job = e.data;
  if (job.mask && job.px) {
    kitCover = maskCover(job.mask, job.px);
    return;
  }
  const g = new THREE.BufferGeometry();
  for (const a of job.attributes) g.setAttribute(a.name, new THREE.BufferAttribute(a.array, a.itemSize));
  g.setIndex(new THREE.BufferAttribute(job.index, 1));
  const start = performance.now();
  try {
    const atlas = bakeCrown(g, job.kit ? kitCover : undefined);
    const ms = performance.now() - start;
    ctx.postMessage({ id: job.id, atlas, ms }, [atlas.normals.buffer, atlas.paint.buffer]);
  } catch {
    ctx.postMessage({ id: job.id, atlas: null, ms: 0 }, []);
  }
};
