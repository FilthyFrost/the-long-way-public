/**
 * The plants of the emergent Earth's places in their places' palettes (core/world/earth/palette.ts,
 * docs/V3/nodes/R1-palettes.md): each plant's leaf and its second colour (its bark, its fruit, its flower) as the
 * plant atlas draws it and as the painted crowns draw it, worked out once for a region and kept while the region
 * stands at its index. A region written by hand has none: its plants keep their own colours.
 *
 * A plant's own colour is what tells it from the plants about it; the place's palette is everything else: a birch
 * stays paler than the oaks and a spruce darker than the pines, and in a snowfield both are its ink green.
 */
import { BIOMES } from '../../core/world/biomes';
import { accentColour, autumnColour, barkColour, grassColour, leafColour, type PlacePalette } from '../../core/world/earth/palette';
import { PLANTS, type PlantDef } from '../../core/world/plants';
import { CROWN_PAINT, paintedFamily } from './crowns/palette';

export interface EarthPaints {
  /** the region's id: the paints are made again when another region stands at the index */
  readonly id: string;
  /** by plant index: its leaf (−1: the region's woods, as the shaders paint a plant without a colour of its own) and its second colour, as the atlas draws it */
  readonly leaf: Int32Array;
  readonly second: Int32Array;
  /** by plant index, as the painted crowns draw it: its leaf and its bark (a fruit tree's fruit) */
  readonly crownLeaf: Int32Array;
  readonly crownSecond: Int32Array;
  /** the leaf of a bush the crowns draw as a family of their own (bush_dry, bush_alpine) */
  bush(family: string): number;
  /** a crown's leaf by the tree's own number (0 … 1): in an autumn wood one tree in seven still green and one in five all gold */
  crownLeafAt(plant: number, vary: number): number;
}

/** the families of blades: their key is the place's meadow, not its woods */
const BLADES = new Set(['tall_grass', 'reed', 'grass_tuft', 'water_plant', 'shoot']);
/** the families whose own colour is no leaf at all: a cap, a crust, a shell, kelp (the place's light only) */
const NOT_LEAVES = new Set(['cap_mushroom', 'cluster_mushroom', 'shelf_mushroom', 'truffle_mound', 'crust', 'crab', 'shell_bed', 'kelp', 'hive', 'rock_nodule']);
/** the trees whose crown is their flowers (a flame tree's red, a jacaranda's purple): an accent of the place, not a leaf */
const BLOSSOMS = new Set(['flame_tree', 'jacaranda']);
/** a leaf of no colour of its own: the plains' crown, the colour the plants' own colours were chosen against */
const PLAIN_LEAF = 0x6aa860;

const byIndex: (EarthPaints | null)[] = [];

function leafOf(pal: PlacePalette, p: PlantDef, own: number): number {
  if (BLOSSOMS.has(p.id)) return accentColour(pal, own);
  if (NOT_LEAVES.has(p.model)) return barkColour(pal, own);
  if (BLADES.has(p.model)) return grassColour(pal, own);
  return leafColour(pal, own);
}

function make(id: string, pal: PlacePalette): EarthPaints {
  const n = PLANTS.length;
  const leaf = new Int32Array(n);
  const second = new Int32Array(n);
  const crownLeaf = new Int32Array(n);
  const crownSecond = new Int32Array(n);
  const crownGreen = new Int32Array(n);
  const crownGold = new Int32Array(n);
  const turned = pal.autumn > 0;
  for (let i = 0; i < n; i++) {
    const p = PLANTS[i];
    const paint = CROWN_PAINT[paintedFamily(p.id, p.model)];
    const woody = p.layer === 'tree' || p.layer === 'shrub';
    const autumn = turned && woody && !p.evergreen;
    // (the atlas: a plant without a colour of its own keeps the region's woods — the palette's key already)
    const own = p.tint?.[0];
    leaf[i] = own === undefined ? -1 : autumn ? autumnColour(pal, paint?.autumn ?? own) : leafOf(pal, p, own);
    const own2 = p.tint?.[1] ?? 0x5a4a3c;
    const fruit = p.bears?.where === 'on' && p.model === 'fruit_tree';
    second[i] = p.layer === 'tree' && !fruit ? barkColour(pal, own2) : accentColour(pal, own2);
    // (the crowns: the family's own leaf where the catalogue's is a flower's or a fruit's, as crownView paints them)
    const crownOwn = (paint && paint.leaf >= 0 && ['maple', 'chestnut_tree', 'willow'].includes(p.id) ? paint.leaf : own) ?? (paint && paint.leaf >= 0 ? paint.leaf : undefined);
    // (a family of no leaf of its own keeps the region's woods, turned in autumn with a green tree and a yellow one among them)
    crownLeaf[i] = crownOwn === undefined ? -1 : autumn ? autumnColour(pal, paint?.autumn ?? crownOwn) : leafOf(pal, p, crownOwn);
    crownSecond[i] = fruit ? accentColour(pal, own2) : barkColour(pal, paint?.bark ?? own2);
    crownGreen[i] = autumn && crownOwn !== undefined ? leafOf(pal, p, crownOwn) : crownLeaf[i];
    crownGold[i] = autumn && crownOwn !== undefined ? autumnColour(pal, 0xe8b440) : crownLeaf[i];
  }
  const bushes = new Map<string, number>();
  return {
    id,
    leaf,
    second,
    crownLeaf,
    crownSecond,
    crownLeafAt(plant: number, vary: number): number {
      if (!turned) return crownLeaf[plant];
      const v = (vary * 5.17) % 1;
      return v < 0.14 ? crownGreen[plant] : v > 0.8 ? crownGold[plant] : crownLeaf[plant];
    },
    bush(family: string): number {
      let c = bushes.get(family);
      if (c === undefined) {
        const paint = CROWN_PAINT[family];
        c = turned && paint?.autumn !== undefined ? autumnColour(pal, paint.autumn) : leafColour(pal, paint && paint.leaf >= 0 ? paint.leaf : PLAIN_LEAF);
        bushes.set(family, c);
      }
      return c;
    },
  };
}

/** the paints of the plants of the region at a registry index, or null where it is no place of the emergent Earth */
export function earthPaints(region: number): EarthPaints | null {
  const r = BIOMES[region];
  const pal = r?.earth?.palette;
  if (!pal) return null;
  const known = byIndex[region];
  if (known && known.id === r.id) return known;
  const made = make(r.id, pal);
  byIndex[region] = made;
  return made;
}
