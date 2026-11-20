/**
 * A species grown for the painted crowns (docs/V3/nodes/P3-variant-packs.md): its variants at the near and the
 * middle levels and in the shadow map, each level's packed in one (variantPack.ts), and each variant's far-level
 * model, which its far picture is baked from. Grown when the crowns first draw the species, in a worker
 * (crownGrowWorker.ts) or, in the harness's stepped frames, there and then — the same code either way. DOM-free.
 */
import * as THREE from 'three';
import { CROWN_LEVELS, type CrownModel } from './grow';
import { GROUND_VARIANTS, KIT_OF, SPECIES, VARIANTS, groundKind, growSpeciesModel, variantsOf } from './species';
import { packVariants, type VariantPack } from './variantPack';
import { floraKind, growFlora } from '../flora/catalog';
import { shadowCaster } from '../flora/shadowCards';

/** the level a tree's shadow is drawn in */
export const SHADOW_LEVEL = 2;

export interface GrownSpecies {
  family: string;
  /** grown by the plant toolkit (scene/flora): drawn with its atlas */
  kit: boolean;
  near: VariantPack;
  mid: VariantPack;
  /** the shadow map's (null: a plant of the ground throws none) */
  shadow: VariantPack | null;
  /** each variant's far-level model: its far picture is baked from it */
  far: THREE.BufferGeometry[];
}

/** a variant's models, by level: the toolkit's kind at its near and middle levels (its far picture and its shadow from the middle one), else the crowns' own grower */
function levelsOf(family: string, kit: boolean, v: { seed: number; grow: Parameters<typeof growSpeciesModel>[0] }): CrownModel[] {
  const kind = kit ? KIT_OF[family] : undefined;
  if (kind) {
    const k = floraKind(kind);
    const mid = growFlora(k, v.seed, 1);
    return [growFlora(k, v.seed, 0), mid, mid];
  }
  return CROWN_LEVELS.map((_, level) => growSpeciesModel(v.grow, v.seed, level));
}

/** a species' variants grown and packed (`kit`: the plant toolkit grows the families it has a kind for) */
export function growSpecies(family: string, kit: boolean, n = VARIANTS): GrownSpecies {
  // (a plant of the ground: its toolkit kind, a few variants by seed; no far picture, no shadow of its own)
  const ground = groundKind(family);
  if (ground) {
    const k = floraKind(ground);
    const models = Array.from({ length: Math.min(n, GROUND_VARIANTS) }, (_, v) => {
      const seed = 7 + 1009 * v;
      return [growFlora(k, seed, 0), growFlora(k, seed, 1)];
    });
    const near = packVariants(models.map((m) => m[0].geometry));
    const mid = packVariants(models.map((m) => m[1].geometry));
    for (const m of models) for (const x of m) x.geometry.dispose();
    return { family, kit: true, near, mid, shadow: null, far: [] };
  }
  const def = SPECIES[family];
  if (!def) throw new RangeError(`no species ${family}`);
  const toolkit = kit && KIT_OF[family] !== undefined;
  const models = variantsOf(def, n).map((v) => levelsOf(family, toolkit, v));
  const near = packVariants(models.map((m) => m[0].geometry));
  const mid = packVariants(models.map((m) => m[1].geometry));
  // (a kit species' shadow: its sprays' uv made their own cards', so the shadow pass cuts them as every tree's)
  const shadow = packVariants(models.map((m) => (toolkit ? shadowCaster(m[SHADOW_LEVEL].geometry) : m[SHADOW_LEVEL].geometry)));
  // (what is in the packs now is let go of; the far models are kept, to be baked)
  for (const m of models) {
    m[0].geometry.dispose();
    if (m[1] !== m[2]) m[1].geometry.dispose();
  }
  return { family, kit: toolkit, near, mid, shadow, far: models.map((m) => m[2].geometry) };
}

/**
 * One tree of a species grown as itself, at the near level, from a seed of its own (docs/V3/nodes/P2-C-unique-trees.md):
 * the toolkit's kind grown from that seed; a crown of the M5 grower in the shape of one of its variants, from that
 * seed. What the nearest trees are drawn with, every one of them its own.
 */
export interface OneTree {
  /** its near level */
  near: THREE.BufferGeometry;
  /** what it throws in the shadow map: its own (as its species' is made), not its variant's, or it is shaded by a crown not its own */
  shadow: THREE.BufferGeometry;
}

export function growOne(family: string, kit: boolean, seed: number): OneTree {
  const toolkit = kit && KIT_OF[family] !== undefined;
  let near: THREE.BufferGeometry, shadow: THREE.BufferGeometry;
  if (toolkit) {
    const k = floraKind(KIT_OF[family]);
    near = growFlora(k, seed, 0).geometry;
    shadow = shadowCaster(growFlora(k, seed, 1).geometry);
  } else {
    const vs = variantsOf(SPECIES[family]);
    const grow = vs[Math.abs(seed) % vs.length].grow;
    near = growSpeciesModel(grow, seed, 0).geometry;
    shadow = growSpeciesModel(grow, seed, SHADOW_LEVEL).geometry;
  }
  // (its own variant number, 0, as the draw's pick: the crowns' shader sends a corner of another variant off screen,
  // and an attribute a geometry lacks reads whatever another program left in its place)
  for (const g of [near, shadow]) g.setAttribute('aVar', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
  return { near, shadow };
}

/** a model's height and its crown's reach from its axis (m): the largest of its corners' */
export function sizeOf(g: THREE.BufferGeometry, variants?: number): Float32Array {
  const p = g.attributes.position.array as ArrayLike<number>;
  const v = variants ? (g.attributes.aVar.array as ArrayLike<number>) : null;
  const out = new Float32Array((variants ?? 1) * 2);
  for (let i = 0, n = p.length / 3; i < n; i++) {
    const k = v ? Math.round(v[i]) * 2 : 0;
    const y = p[i * 3 + 1];
    const r = Math.hypot(p[i * 3], p[i * 3 + 2]);
    if (y > out[k]) out[k] = y;
    if (r > out[k + 1]) out[k + 1] = r;
  }
  return out;
}

/** a species' measure: its first variant's height and crown radius at the size it is grown (m) — what the catalogue's sizes are measured against */
export function measureOf(family: string, kit: boolean): { height: number; radius: number } {
  const ground = groundKind(family);
  if (ground) {
    const m = growFlora(floraKind(ground), 7, 0);
    m.geometry.dispose();
    return { height: m.height, radius: m.radius };
  }
  const def = SPECIES[family];
  const toolkit = kit && KIT_OF[family] !== undefined;
  const first = def.variants[0];
  const m = toolkit ? growFlora(floraKind(KIT_OF[family]), first.seed, 0) : growSpeciesModel(first.grow, first.seed, 0);
  m.geometry.dispose();
  return { height: m.height, radius: m.radius };
}

// ---------------------------------------------------------------------------------------------- to and from a worker

export interface GeometryArrays {
  attributes: { name: string; array: Float32Array; itemSize: number }[];
  index: Uint32Array | Uint16Array;
}

export interface PackArrays {
  geometry: GeometryArrays;
  variants: number;
  trianglesEach: number;
}

export interface GrownArrays {
  family: string;
  kit: boolean;
  near: PackArrays;
  mid: PackArrays;
  shadow: PackArrays | null;
  far: GeometryArrays[];
}

/** a geometry as arrays to send (its own arrays: sent, not copied) */
export function toArrays(g: THREE.BufferGeometry): GeometryArrays {
  const attributes: GeometryArrays['attributes'] = [];
  for (const [name, a] of Object.entries(g.attributes)) {
    const attr = a as THREE.BufferAttribute;
    const array = attr.array instanceof Float32Array && !attr.normalized ? attr.array : Float32Array.from({ length: attr.count * attr.itemSize }, (_, k) => attr.getComponent(Math.floor(k / attr.itemSize), k % attr.itemSize));
    attributes.push({ name, array, itemSize: attr.itemSize });
  }
  const ix = g.index!.array;
  return { attributes, index: ix instanceof Uint16Array ? ix : ix instanceof Uint32Array ? ix : Uint32Array.from(ix as ArrayLike<number>) };
}

export function fromArrays(a: GeometryArrays): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  for (const x of a.attributes) g.setAttribute(x.name, new THREE.BufferAttribute(x.array, x.itemSize));
  g.setIndex(new THREE.BufferAttribute(a.index, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const packOut = (p: VariantPack): PackArrays => ({ geometry: toArrays(p.geometry), variants: p.variants, trianglesEach: p.trianglesEach });
const packIn = (p: PackArrays): VariantPack => ({ geometry: fromArrays(p.geometry), variants: p.variants, trianglesEach: p.trianglesEach });

export function grownToArrays(g: GrownSpecies): { arrays: GrownArrays; transfer: ArrayBuffer[] } {
  const arrays: GrownArrays = { family: g.family, kit: g.kit, near: packOut(g.near), mid: packOut(g.mid), shadow: g.shadow ? packOut(g.shadow) : null, far: g.far.map(toArrays) };
  const transfer = new Set<ArrayBuffer>();
  const take = (a: GeometryArrays): void => {
    for (const x of a.attributes) transfer.add(x.array.buffer as ArrayBuffer);
    transfer.add(a.index.buffer as ArrayBuffer);
  };
  for (const p of [arrays.near, arrays.mid, arrays.shadow]) if (p) take(p.geometry);
  for (const f of arrays.far) take(f);
  return { arrays, transfer: [...transfer] };
}

export function grownFromArrays(a: GrownArrays): GrownSpecies {
  return { family: a.family, kit: a.kit, near: packIn(a.near), mid: packIn(a.mid), shadow: a.shadow ? packIn(a.shadow) : null, far: a.far.map(fromArrays) };
}
