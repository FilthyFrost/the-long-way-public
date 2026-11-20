// A species' variants drawn in one (docs/V3/nodes/P3-variant-packs.md): eight variants grown from a species' own two
// or three shapes, packed a level at a time with every corner told its variant, sent to and from the growth worker
// whole, and the crowns' view growing a species when its first tree is to be drawn and letting it go a while after
// its last.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RenderCore } from '../../src/game/render/core';
import { CrownView } from '../../src/game/scene/crowns/crownView';
import { SPECIES, VARIANTS, variantsOf } from '../../src/game/scene/crowns/species';
import { growSpecies, grownFromArrays, grownToArrays, measureOf } from '../../src/game/scene/crowns/speciesGrow';
import { packVariants } from '../../src/game/scene/crowns/variantPack';
import { FLORA_BUDGET } from '../../src/game/scene/flora/catalog';

describe('variant packs', () => {
  it('grows eight variants from a species\' own shapes: its own first, the rest its shapes drawn a little otherwise', () => {
    for (const [family, def] of Object.entries(SPECIES)) {
      const vs = variantsOf(def);
      expect(vs, family).toHaveLength(VARIANTS);
      expect(vs.slice(0, def.variants.length)).toEqual(def.variants.slice(0, VARIANTS));
      expect(new Set(vs.map((v) => v.seed)).size, `${family}: a seed each`).toBe(VARIANTS);
      expect(variantsOf(def)).toEqual(vs);
      for (const v of vs.slice(def.variants.length)) {
        const base = def.variants[0].grow;
        if (v.grow.kind === 'broadleaf' && base.kind === 'broadleaf') {
          const own = def.variants.find((d) => d.grow.kind === 'broadleaf' && Math.abs(d.grow.shape.trunk - (v.grow as { shape: { trunk: number } }).shape.trunk) <= d.grow.shape.trunk * 0.1 + 1e-9);
          expect(own, `${family}: a broad-leaved variant within a tenth of one of its own`).toBeDefined();
        }
      }
    }
  });

  it('packs a level\'s variants in one geometry, every corner told its variant, a tree\'s triangles their mean', () => {
    const a = new THREE.BoxGeometry(1, 1, 1);
    const b = new THREE.SphereGeometry(1, 8, 6);
    const pack = packVariants([a, b]);
    const n = a.getAttribute('position').count + b.getAttribute('position').count;
    expect(pack.geometry.getAttribute('position').count).toBe(n);
    const v = pack.geometry.getAttribute('aVar');
    expect(v.getX(0)).toBe(0);
    expect(v.getX(n - 1)).toBe(1);
    expect(pack.variants).toBe(2);
    expect(pack.trianglesEach).toBe((a.index!.count + b.index!.count) / 6);
    // (the second's corners are its own, after the first's)
    const ix = pack.geometry.index!;
    expect(ix.getX(a.index!.count)).toBe(a.getAttribute('position').count + b.index!.getX(0));
  });

  it('grows a species whole, and sends it to and from the worker unchanged', () => {
    const g = growSpecies('broadleaf', false);
    expect(g.near.variants).toBe(VARIANTS);
    expect(g.mid.variants).toBe(VARIANTS);
    expect(g.shadow!.variants).toBe(VARIANTS);
    expect(g.far).toHaveLength(VARIANTS);
    const vars = new Set(Array.from(g.near.geometry.getAttribute('aVar').array as Float32Array));
    expect([...vars].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(g.mid.trianglesEach).toBeLessThan(g.near.trianglesEach);
    const pos = Array.from(g.near.geometry.getAttribute('position').array as Float32Array).slice(0, 30);
    const back = grownFromArrays(grownToArrays(growSpecies('broadleaf', false)).arrays);
    expect(Array.from(back.near.geometry.getAttribute('position').array as Float32Array).slice(0, 30)).toEqual(pos);
    expect(back.near.trianglesEach).toBe(g.near.trianglesEach);
    expect(back.far[3].index!.count).toBe(g.far[3].index!.count);
    // (and the toolkit's kind, for a family it has one for)
    const kit = growSpecies('conifer', true);
    expect(kit.kit).toBe(true);
    expect(kit.far).toHaveLength(VARIANTS);
    // (the toolkit's trees within the budget whichever variant: docs/V3/perf-budget.json, conifers 1,800 near and 500 middle)
    // (the conifer's budget, docs/V3/perf-budget.json, raised with the plant pipeline: docs/V3/art/plants-standard.md §6)
    expect(kit.near.trianglesEach).toBeLessThanOrEqual(FLORA_BUDGET.conifer[0]);
    expect(kit.mid.trianglesEach).toBeLessThanOrEqual(FLORA_BUDGET.conifer[1]);
    // (the measure is the first variant's, as it always was)
    const m = measureOf('broadleaf', false);
    expect(m.height).toBeGreaterThan(3);
  });

  it('the view grows a species when its first tree is drawn, and lets it go a minute after its last', () => {
    CrownView.bakeAtOnce = true;
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
      const view = new CrownView({ camera, origin: { x: 0, y: 0, z: 0 } } as unknown as RenderCore);
      expect(view.growStats.grown).toBe(0);
      expect(view.drawCount).toBe(0);
      view.setTile('a', Float32Array.of(0, 0, 0, 0, 1, 1, 0, 3, 0, 0, -1, 0, 0.5, 0, 4, 10), 1);
      // (60 m off: past the reach of the trees drawn as themselves, P2-C, its variant drawn)
      camera.position.set(0, 4, 60);
      view.update();
      expect(view.growStats.grown).toBe(1);
      expect(view.drawCount).toBe(4);
      const drawn = (): THREE.InstancedMesh[] => view.group.children.filter((m) => m.visible && m.layers.mask === 1) as THREE.InstancedMesh[];
      expect(drawn()).toHaveLength(1);
      // (the tree is its fourth variant: its instance says so)
      expect(drawn()[0].geometry.getAttribute('aPick').getX(0)).toBe(3);
      // gone: kept a minute, then let go of
      view.dropTile('a');
      view.update();
      now += 30000;
      view.update();
      expect(view.drawCount).toBe(4);
      now += 31000;
      (view as unknown as { changed: boolean }).changed = true;
      view.update();
      expect(view.drawCount).toBe(0);
      expect(view.growStats.letGo).toBe(1);
      // (and grown again should a tree of it come back)
      view.setTile('b', Float32Array.of(0, 0, 0, 0, 1, 1, 0, 3, 0, 0, -1, 0, 0.5, 0, 4, 10), 1);
      view.update();
      expect(view.growStats.grown).toBe(2);
      expect(drawn()).toHaveLength(1);
      view.dispose();
    } finally {
      clock.mockRestore();
      CrownView.bakeAtOnce = false;
    }
  });
});
