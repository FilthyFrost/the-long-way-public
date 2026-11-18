/**
 * How much a piece of code allocates, for the tests that say "this path allocates nothing" (the kernel's
 * per-frame calls): run it a few thousand times and see how far the heap in use has grown.
 *
 * The collector is run first (asked of V8 at run time, so no flag is needed on the command line) and a run is
 * kept short enough that even code which allocates on every call would not fill the young generation and be
 * collected half way: so "no growth" means "no allocation". A function is measured in several rounds and the
 * least growth counts: before the engine has finished compiling it, every fraction it computes is put on the
 * heap, and how long that takes varies from run to run; code that really allocates on every call does so in
 * every round. A test shows with the same measure that an allocation is seen where there is one.
 */
import v8 from 'node:v8';
import vm from 'node:vm';

v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;

/** calls counted in a round (a few hundred kilobytes when each one allocates, well short of a collection) */
export const HEAP_RUNS = 20_000;

/** the least growth that counts as "it allocates": half of what one small object per call comes to */
export const ALLOCATES = HEAP_RUNS * 8;

/** bytes the heap in use grew by over HEAP_RUNS calls of fn, once fn is compiled: the least of up to twelve rounds */
export function heapGrowth(fn: () => void): number {
  let least = Infinity;
  for (let round = 0; round < 12 && least >= ALLOCATES / 8; round++) {
    for (let i = 0; i < 60_000; i++) fn();
    gc();
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < HEAP_RUNS; i++) fn();
    least = Math.min(least, process.memoryUsage().heapUsed - before);
  }
  return least;
}
