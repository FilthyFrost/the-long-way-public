/**
 * The forage points of a world (node W3, docs/V3/nodes/W3-forage.md): a view over the flora field. A forage
 * point is a plant that bears something to pick (src/core/world/plants.ts bearsAt): a berry bush, an apple
 * tree, a patch of mushrooms. Where plants stand is the flora field's business; this file only finds the
 * bearing ones near a place and gives each a key the save can remember a picked plant by.
 *
 * Pure; allocates nothing once the tiles it reads are in the flora field's cache.
 */
import { ECO_TILE } from '../../world/ecotope';
import { LAYER_CELL, LAYER_TREE, type FloraField, type FloraLayer } from '../../world/flora';
import { bearsAt, plantIndex, PLANTS } from '../../world/plants';
import { FORAGE_INDEX, FORAGE_KINDS } from './kinds';

/** a point one can pick (ForageField.near fills these) */
export class ForagePoint {
  /** stable for this seed and place: the layer and the cell */
  key = 0;
  x = 0;
  y = 0;
  z = 0;
  /** index into FORAGE_KINDS, and into PLANTS for the plant that bears it */
  kind = 0;
  plant = 0;
  /** the plant's size and turn, and its own number 0 … 1 */
  size = 1;
  yaw = 0;
  vary = 0;
  /** one of the half of its kind that shows only after rain (for kinds whose `when` says afterRain) */
  hidden = false;
  /** what it bears is on the plant (true) or fallen under it (false) */
  on = true;
}

/** which forage kind each plant bears (index into FORAGE_KINDS; −1: none), looked up once */
const KIND_OF_PLANT = new Int16Array(PLANTS.length).fill(-1);
for (let i = 0; i < PLANTS.length; i++) {
  const b = PLANTS[i].bears;
  if (b) KIND_OF_PLANT[i] = FORAGE_INDEX[b.forage] ?? -1;
}

/** cells within ±2^20 of the origin each way (a thousand kilometres at 4 m), three layers: a key fits a double exactly */
const SPAN = 1 << 21;

/** the key of the plant in cell (cx, cz) of a layer */
export function pointKey(layer: FloraLayer, cx: number, cz: number): number {
  return (layer * SPAN + cx + SPAN / 2) * SPAN + cz + SPAN / 2;
}

/** the layer and the cell a key names */
export function keyCell(key: number, out: { layer: number; cx: number; cz: number }): void {
  const cz = key % SPAN;
  const rest = (key - cz) / SPAN;
  const cx = rest % SPAN;
  out.layer = (rest - cx) / SPAN;
  out.cx = cx - SPAN / 2;
  out.cz = cz - SPAN / 2;
}

// Root-associated fungi need a compatible tree; litter and shoots need their own parent stand.
// Distances are game-scale neighbourhoods, in metres, not species dispersal limits.
interface HostSite {
  readonly radius: number;
  readonly hosts: readonly number[];
}

function hostSite(radius: number, ...plants: string[]): HostSite {
  return { radius, hosts: plants.map(plantIndex) };
}

const HOSTS: Readonly<Partial<Record<string, HostSite>>> = {
  porcini: hostSite(18, 'pine', 'spruce', 'oak', 'birch'),
  chanterelle: hostSite(18, 'oak', 'birch', 'pine', 'spruce'),
  fly_agaric: hostSite(18, 'pine', 'birch', 'spruce'),
  pine_needle: hostSite(12, 'pine', 'pinyon'),
  bamboo_shoot: hostSite(12, 'bamboo'),
};

const HOST_OF_KIND = FORAGE_KINDS.map(kind => HOSTS[kind.id]);

function nearHost(flora: FloraField, site: HostSite, x: number, z: number): boolean {
  const radius = site.radius;
  for (let tz = Math.floor((z - radius) / ECO_TILE); tz <= Math.floor((z + radius) / ECO_TILE); tz++) {
    for (let tx = Math.floor((x - radius) / ECO_TILE); tx <= Math.floor((x + radius) / ECO_TILE); tx++) {
      const trees = flora.tile(LAYER_TREE, tx, tz);
      for (let i = 0; i < trees.n; i++) {
        const dx = trees.x[i] - x;
        const dz = trees.z[i] - z;
        if (dx * dx + dz * dz <= radius * radius && site.hosts.includes(trees.plant[i])) return true;
      }
    }
  }
  return false;
}

export class ForageField {
  constructor(private readonly flora: FloraField) {}

  /**
   * The forage points within r metres of (x, z): fills `out` from its start (growing it only when it is too
   * short) and returns how many. Every bearing plant of the three layers counts; whether a point shows now
   * (rain, the hour, the tide) and whether it has been picked are the caller's to ask (rules.ts).
   */
  near(x: number, z: number, r: number, out: ForagePoint[]): number {
    let n = 0;
    const tx0 = Math.floor((x - r) / ECO_TILE);
    const tx1 = Math.floor((x + r) / ECO_TILE);
    const tz0 = Math.floor((z - r) / ECO_TILE);
    const tz1 = Math.floor((z + r) / ECO_TILE);
    const r2 = r * r;
    for (let layer = 0 as FloraLayer; layer < 3; layer = (layer + 1) as FloraLayer) {
      const C = LAYER_CELL[layer];
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const t = this.flora.tile(layer, tx, tz);
          for (let i = 0; i < t.n; i++) {
            const kind = KIND_OF_PLANT[t.plant[i]];
            if (kind < 0) continue;
            const dx = t.x[i] - x;
            const dz = t.z[i] - z;
            if (dx * dx + dz * dz > r2) continue;
            const plant = PLANTS[t.plant[i]];
            if (bearsAt(plant, t.vary[i]) === null) continue;
            const host = HOST_OF_KIND[kind];
            if (host && !nearHost(this.flora, host, t.x[i], t.z[i])) continue;
            let p = out[n];
            if (!p) {
              p = new ForagePoint();
              out.push(p);
            }
            p.key = pointKey(layer, Math.floor(t.x[i] / C), Math.floor(t.z[i] / C));
            p.x = t.x[i];
            p.y = t.y[i];
            p.z = t.z[i];
            p.kind = kind;
            p.plant = t.plant[i];
            p.size = t.size[i];
            p.yaw = t.yaw[i];
            p.vary = t.vary[i];
            // the after-rain half: by the plant's own turn, which nothing else reads for this
            p.hidden = FORAGE_KINDS[kind].when?.afterRain === true && t.yaw[i] > 3.141592653589793;
            p.on = plant.bears!.where === 'on';
            n++;
          }
        }
      }
    }
    return n;
  }
}
