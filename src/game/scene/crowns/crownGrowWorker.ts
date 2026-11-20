/**
 * The crowns' growth worker (scene/crowns/speciesGrow.ts grows, scene/crowns/crownGrow.ts asks): a species' variants
 * grown and packed, sent back as arrays. One job at a time, in the order they came.
 */
import { growOne, growSpecies, grownToArrays, toArrays } from './speciesGrow';

interface Job {
  id: number;
  family: string;
  kit: boolean;
  n: number;
  /** one tree grown as itself from this seed (else the species) */
  one?: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };

ctx.onmessage = (e) => {
  const { id, family, kit, n, one } = e.data;
  const start = performance.now();
  if (one !== undefined) {
    try {
      const tree = growOne(family, kit, one);
      const near = toArrays(tree.near);
      const shadow = toArrays(tree.shadow);
      const transfer = [near, shadow].flatMap((a) => [...a.attributes.map((x) => x.array.buffer as ArrayBuffer), a.index.buffer as ArrayBuffer]);
      ctx.postMessage({ id, one: { near, shadow }, ms: performance.now() - start }, transfer);
    } catch {
      ctx.postMessage({ id, one: null, ms: 0 }, []);
    }
    return;
  }
  try {
    const { arrays, transfer } = grownToArrays(growSpecies(family, kit, n));
    ctx.postMessage({ id, grown: arrays, ms: performance.now() - start }, transfer);
  } catch {
    ctx.postMessage({ id, grown: null, ms: 0 }, []);
  }
};
