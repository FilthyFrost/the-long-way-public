/**
 * The places by the road drawn with our models (docs/MODCAR.md §20, src/game/modcar/siteArt.ts): every thing standing
 * at a place that has a model of ours maps to models that are there (the module, its variant, its last piece, its
 * cap), and the variants go where the sites put them (a shop's shelves, a workshop's, a sign pole by its height).
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Site } from '../../src/core/world/sites';
import { World } from '../../src/core/world/terrain';
import { modcarWorldOptions } from '../../src/game/modcar/seamless';
import { PLACE_MODELS, placeModelOf } from '../../src/game/modcar/siteArt';

const DIR = 'public/models/modcar/places';

describe('ModCar places drawn with our models', () => {
  const seen = new Map<string, number>();
  const kinds = new Set<string>();
  for (const seed of [20261118, 7, 314159]) {
    const world = new World(seed, modcarWorldOptions({}));
    const sites: Site[] = [];
    world.sites.between(0, 80_000, sites);
    for (const site of sites) {
      kinds.add(site.kind);
      for (const o of site.objects) {
        const pm = placeModelOf(o, site);
        if (!pm) continue;
        for (const n of [pm.name, pm.alt, pm.last, pm.end]) if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
      }
    }
  }

  it('every model a place asks for is one we have, and its file is there', () => {
    for (const n of seen.keys()) {
      expect(PLACE_MODELS as readonly string[], n).toContain(n);
      expect(fs.existsSync(`${DIR}/${n}.glb`), `${n}.glb`).toBe(true);
    }
  });

  it('every model we list exists as a file', () => {
    for (const n of PLACE_MODELS) expect(fs.existsSync(`${DIR}/${n}.glb`), `${n}.glb`).toBe(true);
  });

  it('the variants are put to use: the shop’s and the workshop’s shelves, the bench’s tool chest, the sign poles, the fence’s posts', () => {
    for (const n of ['shelf_shop', 'shelf_mid', 'shelf_garage', 'toolbox_top', 'signpole', 'signpole_s', 'fence_post', 'bench_plain', 'jetty_deck']) expect(seen.get(n) ?? 0, n).toBeGreaterThan(0);
    expect(kinds.size).toBeGreaterThan(6);
  });
});
