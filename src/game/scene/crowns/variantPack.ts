import * as THREE from 'three';

/**
 * A species' variants drawn in one (docs/V3/nodes/P3-variant-packs.md): the models of its variants at one level of
 * detail laid end to end in one geometry, each corner told which variant it belongs to (aVar). A tree's instance
 * says which it is (aPick) and the shader sends every other variant's corners off the screen
 * (render/crownMaterial.ts, render/shadow.ts): a wood of one species is one draw however many variants it has,
 * where it was one draw a variant. A variant's own corners cost what they did; the others cost their vertex
 * shader's first lines.
 */
export interface VariantPack {
  geometry: THREE.BufferGeometry;
  /** how many variants it holds */
  variants: number;
  /** the triangles of one tree drawn from it: the variants' mean (for the budget's sake) */
  trianglesEach: number;
}

/** the variants' geometries (one level, the same attributes) as one, every corner with its variant's number in aVar */
export function packVariants(models: readonly THREE.BufferGeometry[]): VariantPack {
  if (models.length === 0) throw new RangeError('a pack of no variants');
  // (every attribute any of them has, as wide as the widest: a variant without one gets zeros)
  const sizes = new Map<string, number>();
  for (const g of models) {
    for (const [name, a] of Object.entries(g.attributes)) sizes.set(name, Math.max(sizes.get(name) ?? 0, (a as THREE.BufferAttribute).itemSize));
  }
  let corners = 0;
  let indices = 0;
  for (const g of models) {
    corners += g.getAttribute('position').count;
    indices += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  const arrays = new Map<string, Float32Array>();
  for (const [name, size] of sizes) arrays.set(name, new Float32Array(corners * size));
  const variant = new Float32Array(corners);
  const index = corners > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let base = 0;
  let at = 0;
  models.forEach((g, v) => {
    const n = g.getAttribute('position').count;
    for (const [name, size] of sizes) {
      const a = g.getAttribute(name) as THREE.BufferAttribute | undefined;
      if (!a) continue;
      const dst = arrays.get(name)!;
      const w = a.itemSize;
      if (w === size && a.array instanceof Float32Array && !a.normalized && a.array.length === n * w) dst.set(a.array, base * size);
      else for (let i = 0; i < n; i++) for (let c = 0; c < w; c++) dst[(base + i) * size + c] = a.getComponent(i, c);
    }
    variant.fill(v, base, base + n);
    if (g.index) {
      const ix = g.index;
      for (let i = 0; i < ix.count; i++) index[at + i] = base + ix.getX(i);
      at += ix.count;
    } else {
      for (let i = 0; i < n; i++) index[at + i] = base + i;
      at += n;
    }
    base += n;
  });
  for (const [name, size] of sizes) out.setAttribute(name, new THREE.BufferAttribute(arrays.get(name)!, size));
  out.setAttribute('aVar', new THREE.BufferAttribute(variant, 1));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return { geometry: out, variants: models.length, trianglesEach: indices / 3 / models.length };
}
