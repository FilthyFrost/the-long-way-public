/**
 * Who is holding E on what, right now: so a hold can go faster with two (docs/DESIGN_V2.md 5.6:
 * a tyre change 20 s alone, 8 s with two; 8.1: two lift a large thing). Every actor's UseDriver
 * reports when it starts and stops holding; an interactable asks `count(id)` in its act / channel.
 * In multiplayer the host keeps one of these for everybody (holds are events like any use).
 */
export class Holds {
  private readonly byActor = new Map<string, string>();

  /** `actor` now holds E on `target` ('' or null = on nothing) */
  set(actor: string, target: string | null): void {
    if (target) this.byActor.set(actor, target);
    else this.byActor.delete(actor);
  }

  /** the actors holding E on this interactable */
  who(target: string, out: string[] = []): string[] {
    for (const [a, t] of this.byActor) if (t === target) out.push(a);
    return out;
  }

  count(target: string): number {
    let n = 0;
    for (const t of this.byActor.values()) if (t === target) n++;
    return n;
  }

  /** what this actor holds (null = nothing) */
  of(actor: string): string | null {
    return this.byActor.get(actor) ?? null;
  }

  clear(): void {
    this.byActor.clear();
  }
}
