/**
 * The event bus of the V3 kernel (docs/V3/nodes/N0-foundation.md): one part of the game says that something
 * happened, any other part hears it, and neither names the other.
 *
 * The list of events is the open interface `GameEvents`. A folder adds its own events next to the code that
 * emits them, by declaration merging,
 *
 *     declare module '../../../core/kernel/events' {
 *       interface GameEvents { 'forage:picked': { kind: string; x: number; z: number } }
 *     }
 *
 * and from then on `on('forage:picked', …)` and `emit('forage:picked', …)` are typed everywhere. Names are
 * `<area>:<what happened>`. An event is for something that happened, not for every frame; where one is emitted
 * every frame for a while all the same (drinking), the emitter says so and reuses its payload.
 *
 * Pure: no three, no DOM.
 */

// (empty on purpose: every event is added by the file that emits it)
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GameEvents {}

/** the payload of an event that says nothing more than that it happened */
export type NoPayload = Readonly<Record<string, never>>;

/** the one empty payload (frozen: a listener cannot write into it) */
export const NOTHING: NoPayload = Object.freeze({});

/** one subscription: its listener, and whether it still stands */
interface Sub {
  readonly fn: (event: unknown) => void;
  live: boolean;
}

export class EventBus<M extends object = GameEvents> {
  /** told of a listener that threw (the listeners after it were still called); null: nobody is told */
  onError: ((type: string, error: unknown) => void) | null = null;
  /** how many times a listener has thrown */
  errors = 0;
  /**
   * The listeners of each event, in the order they subscribed. A list is never changed in place: subscribing
   * and unsubscribing put a new list in its stead, so an emit under way goes on over the one it began with.
   */
  private readonly subs = new Map<keyof M, readonly Sub[]>();

  /**
   * Hear an event from now on. Returns the function that stops it (calling it twice does no harm). A listener
   * added while its event is being emitted is first called for the next one; one removed is not called again,
   * not even by the emit under way.
   */
  on<K extends keyof M>(type: K, fn: (event: M[K]) => void): () => void {
    const sub: Sub = { fn: fn as (event: unknown) => void, live: true };
    const list = this.subs.get(type);
    this.subs.set(type, list ? [...list, sub] : [sub]);
    return () => {
      if (!sub.live) return;
      sub.live = false;
      const now = this.subs.get(type);
      if (!now) return;
      const rest = now.filter((s) => s !== sub);
      if (rest.length) this.subs.set(type, rest);
      else this.subs.delete(type);
    };
  }

  /** does anyone hear this event (an emitter on a hot path asks before it builds a payload) */
  has(type: keyof M): boolean {
    return this.subs.has(type);
  }

  /** how many listeners an event has */
  count(type: keyof M): number {
    return this.subs.get(type)?.length ?? 0;
  }

  /**
   * Tell the listeners, in the order they subscribed, before this returns. One that throws is reported to
   * `onError` and the rest are still called. With no listener this does nothing and allocates nothing.
   */
  emit<K extends keyof M>(type: K, event: M[K]): void {
    const list = this.subs.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const sub = list[i];
      if (!sub.live) continue;
      try {
        sub.fn(event);
      } catch (error) {
        this.errors++;
        this.onError?.(String(type), error);
      }
    }
  }
}
