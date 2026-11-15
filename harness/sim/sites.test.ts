/**
 * Gate for the places by the road (specs/roadgen/sites.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Metrics } from './scenarios';
import { collectSiteMetrics } from './sites';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'specs/roadgen/sites.json'), 'utf8')) as {
  title: string;
  metrics: Record<string, { label?: string; min?: number; max?: number }>;
};

describe(`roadgen · ${card.title}`, () => {
  let m: Metrics = {};
  beforeAll(() => {
    m = collectSiteMetrics();
  });
  for (const [key, t] of Object.entries(card.metrics)) {
    it(`${key} — ${t.label ?? ''}`, () => {
      const v = m[key];
      expect(Number.isFinite(v), `${key} was measured`).toBe(true);
      if (t.min !== undefined) expect(v).toBeGreaterThanOrEqual(t.min);
      if (t.max !== undefined) expect(v).toBeLessThanOrEqual(t.max);
    });
  }
});

describe('roadgen · what a car shoves', () => {
  it('a crate run into slides on with its container, and a board goes over and keeps nobody out', async () => {
    const { World } = await import('../../src/core/world/terrain');
    const world = new World(20261113, {});
    const sites = world.sites.between(0, 4000, []);
    const heap = sites.find((s) => s.kind === 'roadside' && s.objects.some((o) => o.kind === 'crate'))!;
    const crate = heap.solids.find((s) => s.tag.endsWith(':crate'))!;
    const o = heap.objects[crate.ref];
    const box = heap.containers.find((c) => c.obj === crate.ref)!;
    const x0 = o.x;
    const z0 = o.z;
    expect(world.sites.knock(crate, 8, 0, 8)).toBe(heap);
    expect(Math.hypot(o.x - x0, o.z - z0)).toBeGreaterThan(1.5);
    expect(Math.hypot(o.x - x0, o.z - z0)).toBeLessThan(4.01);
    expect([box.x, box.z]).toEqual([o.x, o.z]);
    expect(heap.version).toBe(1);
    // its solid went with it
    const moved = heap.solids.find((s) => s.ref === crate.ref)!;
    expect(Math.hypot(moved.x - o.x, moved.z - o.z)).toBeLessThan(1e-9);
    // a board stands on posts: it ends flat, and flat things have no solids
    const camp = sites.find((s) => s.kind === 'camp')!;
    const post = camp.solids.find((s) => s.tag.endsWith(':board'))!;
    const before = camp.solids.length;
    world.sites.knock(post, 0, 6, 6);
    expect(Math.abs(camp.objects[post.ref].roll)).toBeGreaterThan(1);
    expect(camp.solids.length).toBe(before - 2);
    // a wall is not something a car shoves
    const wall = sites.flatMap((s) => s.solids).find((s) => s.tag.endsWith(':building'));
    if (wall) expect(world.sites.knock(wall, 5, 0, 5)).toBeNull();
  });
});
