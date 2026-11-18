/**
 * The interactable sources of the V3 kernel (docs/V3/nodes/N0-foundation.md): how a system puts things into
 * the world that the mark finds and E works, without the player's code knowing the system.
 *
 * The contract for such a thing is the one the garage's buttons, the workshop's machines, the places'
 * containers and the buildings' doors already use: `GarageDevice` (garageStub.ts) — a point and a radius to
 * look at, or a `hit` test of its own; a `word` for the prompt; `use` on a press, or `holdS` and `holding` for
 * E held; `take` and `useWith` for the thing in the hands; a `card`. A source hands out its devices by where
 * the player stands, so a system with thousands of them (plants to pick) only ever offers the few within reach.
 *
 * The player's pick (player.ts) asks the set once a frame on foot. With no source in it that costs one test
 * and allocates nothing.
 */
import type { GarageDevice } from '../garageStub';

export interface InteractSource {
  /**
   * Append to `out` every device of this source that is within r metres of (x, z) on the plan (world metres);
   * one with a shape of its own (`hit`) counts as within when any of it is. Called every frame on foot: it
   * should not allocate (hand out devices that exist already, or reuse a few), and each device's `id` must be
   * unique among everything near (begin it with the system's id: 'forage:1234').
   */
  near(x: number, z: number, r: number, out: GarageDevice[]): void;
}

export class InteractSources implements InteractSource {
  /** told of a source that threw (the others were still asked); null: nobody is told */
  onError: ((error: unknown) => void) | null = null;
  private readonly list: InteractSource[] = [];

  /** nothing to ask (the player's pick skips the set altogether) */
  get empty(): boolean {
    return this.list.length === 0;
  }

  get size(): number {
    return this.list.length;
  }

  /** add a source (once: adding it again changes nothing); returns the function that takes it out */
  add(source: InteractSource): () => void {
    if (!this.list.includes(source)) this.list.push(source);
    return () => this.remove(source);
  }

  remove(source: InteractSource): void {
    const i = this.list.indexOf(source);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** every source's devices within r of (x, z), appended to `out`; a source that throws is reported and left out */
  near(x: number, z: number, r: number, out: GarageDevice[]): void {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const n = out.length;
      try {
        list[i].near(x, z, r, out);
      } catch (error) {
        // (what it had appended before it threw is not offered either)
        out.length = n;
        this.onError?.(error);
      }
    }
  }
}
