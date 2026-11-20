/**
 * The crowns' growth worker (scene/crowns/speciesGrow.ts grows, scene/crowns/crownGrow.ts asks): a species' variants
 * grown and packed, sent back as arrays. One job at a time, in the order they came.
 */
import { growSpecies, grownToArrays } from './speciesGrow';

interface Job {
  id: number;
  family: string;
  kit: boolean;
  n: number;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };

ctx.onmessage = (e) => {
  const { id, family, kit, n } = e.data;
  const start = performance.now();
  try {
    const { arrays, transfer } = grownToArrays(growSpecies(family, kit, n));
    ctx.postMessage({ id, grown: arrays, ms: performance.now() - start }, transfer);
  } catch {
    ctx.postMessage({ id, grown: null, ms: 0 }, []);
  }
};
