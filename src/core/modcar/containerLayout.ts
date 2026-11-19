/**
 * Where the things found in a container lie in it (node M3, docs/V3/nodes/M3-loot.md): a container has places for
 * them — a board of a set of shelves, the bottom of a cupboard behind its doors, a drawer, a crate's bottom, a
 * counter's top — each with its room (across, deep, high). The things go in the biggest first, each into the first
 * place it fits in, standing as it is, turned a quarter, or laid on its side (the ways it is offered, in order), side
 * by side along the place; what fits nowhere stands on the floor before the container. Pure: no three, no DOM.
 */

/** a container's place for things: its room (m, as it stands in the world) */
export interface LayoutRoom {
  /** along it, across the container's front */
  readonly width: number;
  /** into it, from the front back */
  readonly depth: number;
  /** clear above its floor */
  readonly clear: number;
}

/** a thing's size one way it may lie: across (its z as it lies), deep (its x), high */
export interface LayoutWay {
  readonly w: number;
  readonly d: number;
  readonly h: number;
}

/** a thing: the ways it may lie, the most wanted first (the first is how it stands on the floor) */
export interface LayoutThing {
  readonly ways: readonly LayoutWay[];
}

/** where a thing went: which place (−1: on the floor before the container), which way, how far along it from its middle */
export interface LaidOut {
  readonly room: number;
  readonly way: number;
  readonly along: number;
}

/** the gap between two things side by side, and at a place's two ends (m) */
const GAP = 0.03;
/** a thing may stand out of the front of a place by this share of the place's depth */
const OVERHANG = 0.25;

/**
 * Lay the things out in the rooms (in the order the rooms are given: the first wanted first). The result is in
 * the order of the things. The same things in the same rooms lie the same way every time.
 */
export function layOut(things: readonly LayoutThing[], rooms: readonly LayoutRoom[]): LaidOut[] {
  const used = rooms.map(() => GAP);
  const at: { room: number; way: number; start: number }[] = things.map(() => ({ room: -1, way: 0, start: 0 }));
  // (the biggest first, by what it takes of a place's length and height standing; the order given among equals)
  const size = (t: LayoutThing): number => (t.ways[0] ? t.ways[0].w * t.ways[0].h : 0);
  const order = things.map((_, i) => i).sort((a, b) => size(things[b]) - size(things[a]) || a - b);
  let floor = GAP;
  for (const i of order) {
    const t = things[i];
    let put: { room: number; way: number } | null = null;
    for (let r = 0; r < rooms.length && !put; r++) {
      const room = rooms[r];
      for (let k = 0; k < t.ways.length; k++) {
        const w = t.ways[k];
        if (w.h > room.clear || w.d > room.depth * (1 + OVERHANG) || used[r] + w.w + GAP > room.width + 1e-9) continue;
        put = { room: r, way: k };
        break;
      }
    }
    if (put) {
      at[i] = { room: put.room, way: put.way, start: used[put.room] };
      used[put.room] += t.ways[put.way].w + GAP;
    } else {
      at[i] = { room: -1, way: 0, start: floor };
      floor += (t.ways[0]?.w ?? 0) + GAP;
    }
  }
  // (each place's row centred along it: the things in the middle, not crowded at one end)
  return at.map((a, i) => {
    const w = things[i].ways[a.way]?.w ?? 0;
    const width = a.room >= 0 ? rooms[a.room].width : floor + GAP;
    const fill = a.room >= 0 ? used[a.room] : floor;
    return { room: a.room, way: a.way, along: -width / 2 + (width - fill) / 2 + a.start + w / 2 };
  });
}
