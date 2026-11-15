/**
 * The animals at the places by the road: they stay where they live, they notice what comes
 * running long before what comes creeping, they run and stop and look back, and they do the same
 * thing every time.
 */
import { describe, expect, it } from 'vitest';
import { Fauna, presence, type Threat } from '../../src/core/world/fauna';
import type { Site } from '../../src/core/world/sites';
import { TerrainPoint, World } from '../../src/core/world/terrain';

function firstSite(kind: string, biome = 'plains'): { world: World; site: Site } {
  for (let seed = 1; seed <= 60; seed++) {
    const world = new World(seed, { startBiome: biome });
    const site = world.sites.between(0, 40000, []).find((s) => s.kind === kind && s.zoneR > 10);
    if (site) return { world, site };
  }
  throw new Error(`no ${kind} found`);
}

/** walk a threat at the herd from 160 m out; returns how near it was when the first animal took fright, and when the first ran */
function approach(world: World, site: Site, speed: number, heard: number, seen: number): { noticed: number; ran: number; fauna: Fauna; threat: Threat } {
  const fauna = new Fauna(world, new TerrainPoint());
  const herd = fauna.herdOf(site)!;
  // settle for a minute with nobody about, then come in from the road side
  for (let i = 0; i < 600; i++) fauna.update(0.1, site.x, site.z, 6.5, []);
  const dx = site.x - herd.homeX;
  const dz = site.z - herd.homeZ;
  const d0 = Math.hypot(dx, dz);
  const threat: Threat = { x: herd.homeX + (dx / d0) * 160, z: herd.homeZ + (dz / d0) * 160, heard, seen };
  let noticed = -1;
  let ran = -1;
  for (let t = 0; t < 400 && ran < 0; t += 0.1) {
    threat.x -= (dx / d0) * speed * 0.1;
    threat.z -= (dz / d0) * speed * 0.1;
    fauna.update(0.1, threat.x, threat.z, 6.5, [threat]);
    let nearest = Infinity;
    for (const a of herd.animals) if (!a.hidden) nearest = Math.min(nearest, Math.hypot(a.x - threat.x, a.z - threat.z));
    if (noticed < 0 && herd.animals.some((a) => a.state === 'alert' || a.state === 'flee')) noticed = nearest;
    if (herd.animals.some((a) => a.state === 'flee')) ran = nearest;
    if (Math.hypot(threat.x - herd.homeX, threat.z - herd.homeZ) < 2) break;
  }
  return { noticed, ran, fauna, threat };
}

describe('fauna', () => {
  it('the whole herd is out at dawn and dusk, part of it by day and at night', () => {
    expect(presence(6.5)).toBe(1);
    expect(presence(18.5)).toBe(1);
    expect(presence(13)).toBeLessThan(0.7);
    expect(presence(1)).toBeLessThan(0.5);
  });

  it('left alone, deer keep to their ground: near the lick, out of the water, off the road', () => {
    const { world, site } = firstSite('hide');
    const fauna = new Fauna(world, new TerrainPoint());
    const herd = fauna.herdOf(site)!;
    expect(herd.animals.length).toBeGreaterThanOrEqual(3);
    const tp = new TerrainPoint();
    const states = new Set<string>();
    for (let i = 0; i < 6000; i++) {
      fauna.update(0.1, site.x, site.z, 6.5, []);
      if (i % 20) continue;
      for (const a of herd.animals) {
        states.add(a.state);
        expect(Math.hypot(a.x - herd.homeX, a.z - herd.homeZ)).toBeLessThan(herd.radius + 8);
        world.shape(a.x, a.z, tp);
        expect(tp.wl > tp.bed + 0.05).toBe(false);
        expect(Math.abs(tp.d)).toBeGreaterThan(13);
        expect(Math.abs(a.y - tp.h)).toBeLessThan(0.05);
      }
    }
    // they do more than stand there
    expect(states.has('graze') && states.has('look') && states.has('walk')).toBe(true);
    expect(states.has('flee')).toBe(false);
  });

  it('running at them is noticed far off and they are gone; creeping gets much closer', () => {
    const { world, site } = firstSite('hide');
    const run = approach(world, site, 3.6, 40, 40);
    expect(run.noticed).toBeGreaterThan(28);
    expect(run.ran).toBeGreaterThan(14);
    // once they have run they stop a good way off and look back
    const herd = run.fauna.herdOf(site)!;
    for (let i = 0; i < 250; i++) run.fauna.update(0.1, run.threat.x, run.threat.z, 6.5, [run.threat]);
    for (const a of herd.animals) if (!a.hidden) expect(Math.hypot(a.x - run.threat.x, a.z - run.threat.z)).toBeGreaterThan(38);
    const creep = approach(world, site, 0.9, 8, 20);
    expect(creep.noticed).toBeLessThan(22);
    expect(creep.noticed).toBeLessThan(run.noticed - 10);
  });

  it('the same approach frightens the same deer', () => {
    const { world, site } = firstSite('hide');
    const a = approach(world, site, 3.6, 40, 40);
    const b = approach(world, site, 3.6, 40, 40);
    expect(a.noticed).toBe(b.noticed);
    expect(a.fauna.herdOf(site)!.animals.map((x) => [x.x, x.z, x.state])).toEqual(b.fauna.herdOf(site)!.animals.map((x) => [x.x, x.z, x.state]));
  });

  it('ducks keep to the water off the jetty', () => {
    const { world, site } = firstSite('jetty');
    const fauna = new Fauna(world, new TerrainPoint());
    const herd = fauna.herdOf(site)!;
    expect(herd.species).toBe('duck');
    const tp = new TerrainPoint();
    for (let i = 0; i < 3000; i++) {
      fauna.update(0.1, site.x, site.z, 10, []);
      if (i % 50) continue;
      for (const a of herd.animals) {
        if (a.hidden) continue;
        world.shape(a.x, a.z, tp);
        expect(tp.wl - tp.bed).toBeGreaterThan(0.2);
        expect(a.y).toBeCloseTo(tp.wl, 3);
      }
    }
  });
});
