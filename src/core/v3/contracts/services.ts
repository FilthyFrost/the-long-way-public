/**
 * The services a V3 system may call (docs/V3/ARCHITECTURE.md). This file holds only the open list:
 * each contract file adds its own service to it by declaration merging, next to the service's interface,
 *
 *     declare module './services' {
 *       interface Services { stash: StashService }
 *     }
 *
 * so that a system reaches every service as `ctx.services.<name>` and no two packages edit one file.
 * A service is an interface here and an implementation registered at start-up by the system that owns it;
 * `ServiceId` is the list of names. Types only: no three, no DOM.
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Services {}

export type ServiceId = keyof Services;

/** how the kernel hands services out; a system asks for a service in `init`, never at module top level */
export interface ServiceRegistry {
  /** the owner registers its implementation once, before any system's `init` runs */
  provide<K extends ServiceId>(id: K, impl: Services[K]): void;
  /** throws when nothing was provided under this name: a missing dependency is a start-up error */
  get<K extends ServiceId>(id: K): Services[K];
  has(id: ServiceId): boolean;
}
