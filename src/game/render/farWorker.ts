/**
 * The far models' worker (render/farSimplify.ts, render/carFar.ts): takes a merged mesh's positions and index,
 * gives back the reduced index. One job at a time, in the order they came.
 */
import { reduceIndex, simplifierReady } from './farSimplify';

interface Job {
  id: number;
  positions: Float32Array;
  indices: Uint32Array;
  share: number;
  error: number;
  prune: boolean;
}

const ctx = self as unknown as { onmessage: ((e: MessageEvent<Job>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };

ctx.onmessage = (e) => {
  const { id, positions, indices, share, error, prune } = e.data;
  void simplifierReady().then(() => {
    let out: Uint32Array;
    try {
      out = reduceIndex(positions, indices, share, error, prune);
    } catch {
      out = new Uint32Array(0);
    }
    // (a copy when it gave back what it was given: that buffer is not ours to send back)
    const send = out === indices ? out.slice() : out;
    ctx.postMessage({ id, indices: send }, [send.buffer]);
  });
};
