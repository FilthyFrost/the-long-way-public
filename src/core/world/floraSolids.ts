/**
 * The trunks of the trees as things one cannot walk or drive through (docs/V3/nodes/W2-flora.md, "树有没有碰撞"):
 * every tree the flora field stands (flora.ts, the tree layer) is a round post, as thick as its kind's trunk
 * at its size, from its roots to its top. A `SolidSource` like the places' and the road furniture's
 * (solids.ts): whoever moves through the world adds it to the sources it asks.
 *
 * The trunks come from the flora field's own tiles, so they are the trees that are drawn. A tile's trunks
 * are made the first time something comes near them and kept as long as the field keeps the tile; after
 * that a question allocates nothing, and the same trunk is the same object from one question to the next
 * (a vehicle tells by that what it is already touching).
 */
import { ECO_TILE } from './ecotope';
import { LAYER_CELL, LAYER_TREE, type FloraField, type FloraTile } from './flora';
import { PLANTS } from './plants';
import { Solid, type SolidSource } from './solids';

/** the tag of a trunk (Solid.tag); its `ref` is the tree's kind, an index into PLANTS */
export const TREE_TAG = 'tree';
/** how far below the ground at its middle a trunk reaches (m): on a slope its downhill side stands lower */
const ROOT = 0.6;

/** the thickest any trunk is (m): a trunk whose middle is this much farther off than asked may still reach */
let THICKEST = 0;
for (const p of PLANTS) if (p.layer === 'tree' && p.trunk * 1.5 > THICKEST) THICKEST = p.trunk * 1.5;

export class FloraSolids implements SolidSource {
  /** the trunks of the tiles asked about, plant by plant in the tile's own order (the tile's `row` finds them) */
  private readonly made = new WeakMap<FloraTile, Solid[]>();

  constructor(private readonly flora: FloraField) {}

  private trunksOf(t: FloraTile): Solid[] {
    let list = this.made.get(t);
    if (!list) {
      list = [];
      for (let i = 0; i < t.n; i++) {
        const p = PLANTS[t.plant[i]];
        const s = new Solid().set(t.x[i], t.z[i], p.trunk * t.size[i], 0, 0, t.y[i] - ROOT, t.y[i] + p.height * t.size[i], false, TREE_TAG);
        s.ref = t.plant[i];
        list.push(s);
      }
      this.made.set(t, list);
    }
    return list;
  }

  /** append the trunk of every tree whose trunk comes within r metres of (x, z) */
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    const reach = r + THICKEST;
    const C = LAYER_CELL[LAYER_TREE];
    const per = ECO_TILE / C;
    const tx1 = Math.floor((x + reach) / ECO_TILE);
    const tz1 = Math.floor((z + reach) / ECO_TILE);
    for (let tz = Math.floor((z - reach) / ECO_TILE); tz <= tz1; tz++) {
      for (let tx = Math.floor((x - reach) / ECO_TILE); tx <= tx1; tx++) {
        const t = this.flora.tile(LAYER_TREE, tx, tz);
        if (t.n === 0) continue;
        const list = this.trunksOf(t);
        // the rows of cells the round reaches, and of those the trees near enough
        let k0 = Math.floor((z - reach) / C) - tz * per;
        let k1 = Math.floor((z + reach) / C) - tz * per;
        if (k0 < 0) k0 = 0;
        if (k1 > per - 1) k1 = per - 1;
        for (let i = t.row[k0]; i < t.row[k1 + 1]; i++) {
          const s = list[i];
          const dx = s.x - x;
          const dz = s.z - z;
          const lim = r + s.hx;
          if (dx * dx + dz * dz < lim * lim) out.push(s);
        }
      }
    }
  }
}

const sources = new WeakMap<FloraField, FloraSolids>();

/**
 * The trunks of the trees near a point: appends to `out` the trunk of every tree of `flora` whose trunk comes
 * within r metres of (x, z). (One FloraSolids to a field, made when first asked for.)
 */
export function floraSolidsNear(flora: FloraField, x: number, z: number, r: number, out: Solid[]): void {
  let s = sources.get(flora);
  if (!s) {
    s = new FloraSolids(flora);
    sources.set(flora, s);
  }
  s.solidsNear(x, z, r, out);
}
