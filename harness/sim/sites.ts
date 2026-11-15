/**
 * Headless checks of the places by the road: how often they come and what kinds, that a filling
 * station is never too far, that the levelled ground is level and dry, that things stand on the
 * ground and off the road, and that every player gets the same ones.
 */
import { CONTAINER_KINDS, rollLoot } from '../../src/core/items/loot';
import { SITE_SLOT, type Site, type SiteObject } from '../../src/core/world/sites';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const FULL = process.env.FULL === '1';

function key(s: Site): string {
  return `${s.id}:${s.kind}:${s.s.toFixed(3)}:${s.side}:${s.objects.length}:${s.containers.map((c) => c.seed).join(',')}:${s.objects.map((o) => `${o.kind}@${o.x.toFixed(3)},${o.y.toFixed(3)},${o.z.toFixed(3)}`).join(';')}`;
}

/** is (x, z) inside one of the site's buildings (or on a jetty, a stand)? Things there stand on its floor, not the ground */
function onSomething(site: Site, o: SiteObject): boolean {
  for (const b of site.objects) {
    if (b === o || (b.kind !== 'building' && b.kind !== 'jetty' && b.kind !== 'stand' && b.kind !== 'workbench' && b.kind !== 'shelter')) continue;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const u = (o.x - b.x) * c + (o.z - b.z) * s;
    const v = -(o.x - b.x) * s + (o.z - b.z) * c;
    if (Math.abs(u) < b.w / 2 + 0.2 && Math.abs(v) < b.d / 2 + 0.2) return true;
  }
  return false;
}

export function collectSiteMetrics(): Metrics {
  const seeds = FULL ? 48 : 12;
  const len = 60000;
  const tp = new TerrainPoint();
  const st = new SpineSample();
  let km = 0;
  let places = 0;
  let wrecks = 0;
  let heaps = 0;
  const kinds = new Set<string>();
  let maxGap = 0;
  let firstStation = 0;
  let padSlope = 0;
  let padWet = 0;
  let padMiss = 0;
  let afloat = 0;
  let onRoad = 0;
  let mism = 0;
  let containers = 0;
  let loose = 0;
  let buildings = 0;
  let fuel = 0;
  let emptyBoxes = 0;
  let boxes = 0;
  let zones = 0;
  let zoneSites = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const opts = { chapterScale: 0.5, startBiome: seed % 3 === 0 ? 'alpine' : seed % 3 === 1 ? 'plains' : 'desert' };
    const world = new World(seed, opts);
    const again = new World(seed, opts);
    // the second world is asked far ahead first, and through the land rather than the plan
    again.spine.at(len * 0.7, st);
    again.heightAt(st.x, st.z + 9);
    const a = world.sites.between(0, len, []);
    const b = again.sites.between(0, len, []);
    if (a.length !== b.length) mism++;
    else for (let i = 0; i < a.length; i++) if (key(a[i]) !== key(b[i])) mism++;
    km += len / 1000;
    let lastStation = 0;
    let seenStation = false;
    for (const site of a) {
      if (site.kind === 'roadside') {
        if (site.objects.some((o) => o.kind === 'wreck')) wrecks++;
        else heaps++;
      } else {
        places++;
        kinds.add(site.kind);
      }
      if (site.kind === 'station') {
        if (!seenStation) firstStation = Math.max(firstStation, site.s / 1000);
        seenStation = true;
        maxGap = Math.max(maxGap, (site.s - lastStation) / 1000);
        lastStation = site.s;
      }
      if (site.kind === 'station' || site.kind === 'garage' || site.kind === 'shop' || site.kind === 'house') {
        buildings++;
        containers += site.containers.length;
        loose += site.loose.length;
      }
      if (site.kind === 'jetty' || site.kind === 'hide') {
        zoneSites++;
        if (site.zoneR > 0) zones++;
      }
      for (const f of site.fuel) fuel += f.litres;
      for (const c of site.containers) {
        boxes++;
        if (!CONTAINER_KINDS.includes(c.kind) || rollLoot(c.kind, c.seed).length === 0) emptyBoxes++;
      }
      // ---- the levelled ground: level, dry, and where the plan says it is
      if (site.depth > 0) {
        const L = site.halfL;
        for (let aa = -L + 1.5; aa <= L - 1.5; aa += 3) {
          let prev = NaN;
          for (let bb = 5.5; bb <= site.depth - 1.5; bb += 3) {
            const x = site.x + site.e1x * aa + site.e2x * bb;
            const z = site.z + site.e1z * aa + site.e2z * bb;
            world.shape(x, z, tp);
            if (tp.site < 0.9) padMiss++;
            if (tp.wl > -1e8 && tp.wl > tp.bed - 0.05) padWet++;
            if (prev === prev) padSlope = Math.max(padSlope, Math.abs(tp.h - prev) / 3);
            prev = tp.h;
            world.shape(x + site.e1x * 3, z + site.e1z * 3, tp);
            if (aa + 3 <= L - 1.5) padSlope = Math.max(padSlope, Math.abs(tp.h - prev) / 3);
          }
        }
      }
      // ---- things stand on the ground (or on a floor), and nothing solid stands in the road
      for (const o of site.objects) {
        if (o.kind === 'jetty' || o.kind === 'boat' || o.kind === 'icehole' || o.kind === 'bag' || o.kind === 'tacklebox') continue;
        if (onSomething(site, o)) continue;
        world.shape(o.x, o.z, tp);
        const lift = o.y - tp.h;
        // (a building's floor stands a step above the ground at its highest corner, and so does the foot of a
        // lighthouse on its plinth; a hut on the ice, on the ice)
        if (o.kind === 'building' || o.kind === 'lighthouse' ? lift < 0.01 || lift > 1.9 : Math.abs(lift) > 0.4) afloat++;
      }
      for (const sd of site.solids) {
        world.shape(sd.x, sd.z, tp);
        const dy = sd.yaw - tp.phi;
        const reach = sd.hz === 0 ? sd.hx : sd.hx * Math.abs(Math.sin(dy)) + sd.hz * Math.abs(Math.cos(dy));
        if (Math.abs(tp.d) - reach < 3.6) onRoad++;
      }
    }
    maxGap = Math.max(maxGap, (len - lastStation) / 1000);
  }
  return {
    sites_places_per_10km: (places / km) * 10,
    sites_wrecks_per_10km: (wrecks / km) * 10,
    sites_heaps_per_10km: (heaps / km) * 10,
    sites_kinds_seen: kinds.size,
    sites_station_max_gap_km: maxGap,
    sites_first_station_km: firstStation,
    sites_pad_max_slope: padSlope,
    sites_pad_wet_points: padWet,
    sites_pad_missing_points: padMiss,
    sites_objects_afloat: afloat,
    sites_solids_on_road: onRoad,
    sites_determinism_mismatches: mism,
    sites_containers_per_building: containers / Math.max(1, buildings),
    sites_loose_per_building: loose / Math.max(1, buildings),
    sites_fuel_l_per_100km: (fuel / km) * 100,
    sites_empty_containers: emptyBoxes / Math.max(1, boxes),
    sites_zones_share: zones / Math.max(1, zoneSites),
  };
}

// npx tsx harness/sim/sites.ts list <seed> [chapterScale] [biome] [km]: what stands where (for screenshots)
if (process.argv[2] === 'list') {
  const seed = Number(process.argv[3] ?? 7);
  const world = new World(seed, { chapterScale: Number(process.argv[4] ?? 1), startBiome: process.argv[5] ?? 'plains' });
  for (const s of world.sites.between(0, Number(process.argv[6] ?? 30) * 1000, [])) {
    const what = s.kind === 'roadside' ? s.objects.map((o) => (o.kind === 'wreck' ? `wreck${o.v & 7}${o.v & 8 ? '(stripped)' : ''}` : o.kind)).join('+') : s.kind;
    console.log(`slot ${String(s.slot).padStart(2)}  s=${s.s.toFixed(0).padStart(6)}  ${s.side > 0 ? 'right' : 'left '}  ${what.padEnd(22)} objects=${String(s.objects.length).padStart(2)} boxes=${s.containers.length} loose=${s.loose.length} fuel=${s.fuel.map((f) => f.litres).join('/') || '-'}${s.zoneR > 0 ? `  zone r=${s.zoneR}` : ''}${s.depth > 0 ? `  pad ${s.halfL * 2}×${(s.depth - 4.5).toFixed(0)}` : ''}`);
  }
  console.log(`slot length ${SITE_SLOT} m`);
}
