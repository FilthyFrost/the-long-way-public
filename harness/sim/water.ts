/**
 * Headless checks of lakes, rivers and bridges: how often they come, that the road never gets its
 * feet wet, that shores hold their water, and that a bridge deck is one smooth piece of road.
 */
import { VehicleSim } from '../../src/core/vehicle/sim';
import { T0_TRUCK } from '../../src/core/vehicle/spec';
import { SpineSample } from '../../src/core/world/spine';
import { ROAD_EDGE, TerrainPoint, World } from '../../src/core/world/terrain';
import { WATER_SLOT, WaterPlan, type Lake, type River, type WaterFeature } from '../../src/core/world/water';
import type { Metrics } from './scenarios';

const FULL = process.env.FULL === '1';

export function listFeatures(world: World, sMax: number): WaterFeature[] {
  return world.water.between(0, sMax, []);
}

function key(f: WaterFeature): string {
  if (f.kind === 'stream') return `S${f.slot}:${f.s0.toFixed(3)},${f.gap.toFixed(4)},${f.width.toFixed(4)}`;
  return f.kind === 'lake' ? `L${f.slot}:${f.cx.toFixed(3)},${f.cz.toFixed(3)},${f.a.toFixed(3)},${f.b.toFixed(3)},${f.level.toFixed(4)}` : `R${f.slot}:${f.s.toFixed(3)},${f.slope0.toFixed(6)},${f.w0.toFixed(4)},${f.level0.toFixed(4)},${f.span0.toFixed(3)}`;
}

export function collectWaterMetrics(): Metrics {
  const seeds = FULL ? 60 : 14;
  const len = 40000;
  const st = new SpineSample();
  const tp = new TerrainPoint();
  let lakes = 0;
  let rivers = 0;
  let km = 0;
  let minClear = Infinity;
  let flooded = 0;
  let leaks = 0;
  let maxStep = 0;
  let mism = 0;
  let minUnder = Infinity;
  let dryRivers = 0;
  let bridges = { arch: 0, beam: 0, truss: 0 };
  const rc = { x: 0, dx: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    // every other seed starts in the mountains, so frozen water is covered too
    const world = new World(seed, { chapterScale: 0.5, startBiome: seed % 3 === 0 ? 'alpine' : 'plains' });
    const again = new World(seed, { chapterScale: 0.5, startBiome: seed % 3 === 0 ? 'alpine' : 'plains' });
    // the second world is asked in another order: features must not depend on who asks first
    const fb = again.water.between(len / 2, len, []).concat(again.water.between(0, len / 2 - 1, []));
    const fa = listFeatures(world, len);
    const ka = fa.map(key).sort();
    const kb = fb.map(key).sort();
    if (ka.length !== kb.length) mism++;
    else for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) mism++;
    km += len / 1000;
    const sp = world.spine;
    for (const f of fa) {
      if (f.kind === 'lake') lakes++;
      else if (f.kind === 'river') {
        rivers++;
        bridges[f.bridge]++;
      }
    }
    // ---- the road: never under water, and no water within 12 m of it except under a bridge
    const probe = { river: null as River | null, mask: 0 };
    for (let s = 200; s < len; s += 6) {
      sp.at(s, st);
      const nx = -Math.sin(st.phi);
      const nz = Math.cos(st.phi);
      world.water.bridgeAt(s, probe);
      for (const d of [0, -3.2, 3.2, -ROAD_EDGE, ROAD_EDGE]) {
        world.shape(st.x + nx * d, st.z + nz * d, tp);
        if (tp.wl > -1e8) {
          const c = tp.h - tp.wl;
          if (c < minClear) minClear = c;
        }
      }
      if (probe.mask === 0) {
        for (const d of [-12, -8, -6, 6, 8, 12]) {
          world.shape(st.x + nx * d, st.z + nz * d, tp);
          if (tp.wl > tp.bed + 0.02) flooded++;
        }
      }
    }
    for (const f of fa) {
      if (f.kind === 'lake') leaks += lakeLeaks(world, f, tp);
      else if (f.kind === 'river') {
        // ---- a river: water all the way (until it tapers out), banks that hold it
        let wet = 0;
        let n = 0;
        for (let zr = -f.zEnd + 760; zr <= f.zEnd - 760; zr += 14) {
          WaterPlan.riverCentre(f, zr, rc);
          const w = WaterPlan.riverHalfWidth(f, zr);
          const cx = rc.x;
          const cz = f.z0 + zr;
          world.shape(cx, cz, tp);
          n++;
          if (tp.wl > tp.bed + 0.3) wet++;
          // just outside the water on both sides the land must stand above it
          const inv = 1 / Math.sqrt(1 + rc.dx * rc.dx);
          const px = inv;
          const pz = -rc.dx * inv;
          for (const sd of [-1, 1]) {
            world.shape(cx + px * sd * (w + 4), cz + pz * sd * (w + 4), tp);
            // (the bridge's own deck stands over the river: look at the land under it; and where
            // another river joins, its water is not a leak: wlat < 0 means "inside a river")
            if (tp.wkind === 2 && tp.wlat > 0.5 && tp.bed < tp.wl - 0.02) leaks++;
          }
        }
        if (wet < n * 0.97) dryRivers++;
        // ---- its bridge: the deck is one smooth piece of road, with the river well below
        for (const d of [0, -2.5, 2.5, -4.4, 4.4]) {
          let prev = NaN;
          for (let s = f.span0 - 30; s <= f.span1 + 30; s += 0.5) {
            sp.at(s, st);
            world.shape(st.x - Math.sin(st.phi) * d, st.z + Math.cos(st.phi) * d, tp);
            const plane = tp.h - st.y;
            if (prev === prev) {
              const step = Math.abs(plane - prev);
              if (step > maxStep) maxStep = step;
            }
            prev = plane;
          }
        }
        sp.at(f.s, st);
        world.shape(st.x, st.z, tp);
        if (tp.h - tp.bed < minUnder) minUnder = tp.h - tp.bed;
      }
    }
  }
  return {
    water_lakes_per_10km: (lakes / km) * 10,
    water_rivers_per_10km: (rivers / km) * 10,
    water_bridge_kinds: (bridges.arch > 0 ? 1 : 0) + (bridges.beam > 0 ? 1 : 0) + (bridges.truss > 0 ? 1 : 0),
    water_road_min_clearance_m: minClear,
    water_flooded_verge_points: flooded,
    water_shore_leaks: leaks,
    water_dry_rivers: dryRivers,
    water_deck_max_step_mm: maxStep * 1000,
    water_bridge_min_headroom_m: minUnder,
    water_determinism_mismatches: mism,
    ...wadeTest(),
  };
}

/** points round a lake's rim where the land lets the water out */
function lakeLeaks(world: World, f: Lake, tp: TerrainPoint): number {
  let leaks = 0;
  for (let k = 0; k < 96; k++) {
    const an = (k / 96) * Math.PI * 2;
    const ca = Math.cos(an);
    const sa = Math.sin(an);
    for (let q = 0.5; q <= 1.28; q += 0.02) {
      const u = ca * f.a * q;
      const v = sa * f.b * q;
      const x = f.cx + u * f.ax - v * f.az;
      const z = f.cz + u * f.az + v * f.ax;
      const rho = WaterPlan.lakeRho(f, x, z);
      // (from the shore out to the top of the beach; further out the rim may fall away as a bank)
      if (rho < 0.9 || rho > 1.12) continue;
      world.shape(x, z, tp);
      if (tp.bed < f.level - 0.005) leaks++;
    }
  }
  return leaks;
}

/**
 * Drive the truck down a beach into the first open lake at 30 km/h, throttle held: the water must
 * take it gently (no explosion, no sinking to the middle) — it stops, wet, a few metres in.
 */
function wadeTest(): Metrics {
  for (let seed = 1; seed <= 40; seed++) {
    const world = new World(seed, { chapterScale: 1, startBiome: 'plains' });
    const lake = listFeatures(world, 16000).find((f): f is Lake => f.kind === 'lake' && f.frozen < 0.5 && f.b > 60);
    if (!lake) continue;
    const tp = new TerrainPoint();
    // start on the beach on the side away from the road (the gentlest shore), pointing at the middle
    const side = lake.side;
    let q = 1.25;
    for (; q > 0.6; q -= 0.005) {
      world.shape(lake.cx - lake.az * side * lake.b * q, lake.cz + lake.ax * side * lake.b * q, tp);
      if (tp.wl > -1e8 && tp.wl > tp.bed - 0.35) break;
    }
    const sx = lake.cx - lake.az * side * lake.b * q;
    const sz = lake.cz + lake.ax * side * lake.b * q;
    const yaw = Math.atan2(-(lake.cz - sz), lake.cx - sx);
    const v = new VehicleSim(T0_TRUCK);
    world.shape(sx, sz, tp);
    v.reset(sx, tp.h + 0.05, sz, yaw);
    v.vx = Math.cos(yaw) * 8.3;
    v.vz = -Math.sin(yaw) * 8.3;
    let maxDepth = 0;
    const inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    for (let i = 0; i < 12 / v.h; i++) {
      v.substep(inp, world);
      world.shape(v.px, v.pz, tp);
      if (tp.wl > -1e8 && tp.wl - tp.h > maxDepth) maxDepth = tp.wl - tp.h;
    }
    return { water_wade_stop_kmh: v.kmh, water_wade_max_depth_m: maxDepth, water_wade_exploded: v.exploded ? 1 : 0 };
  }
  return { water_wade_stop_kmh: NaN, water_wade_max_depth_m: NaN, water_wade_exploded: NaN };
}

// npx tsx harness/sim/water.ts list <seed> [chapterScale] [biome]: where the water is (for screenshots)
if (process.argv[2] === 'list') {
  const seed = Number(process.argv[3] ?? 7);
  const world = new World(seed, { chapterScale: Number(process.argv[4] ?? 1), startBiome: process.argv[5] ?? 'plains' });
  for (const f of listFeatures(world, 30000)) {
    if (f.kind === 'lake') console.log(`lake  slot ${f.slot}  s=${f.s.toFixed(0)}  side=${f.side > 0 ? 'right' : 'left'}  a=${f.a.toFixed(0)} b=${f.b.toFixed(0)}  level=${f.level.toFixed(1)}  frozen=${f.frozen.toFixed(1)}`);
    else if (f.kind === 'river') console.log(`river slot ${f.slot}  s=${f.s.toFixed(0)}  w0=${f.w0.toFixed(0)}  span=${(f.span1 - f.span0).toFixed(0)} m  ${f.bridge}  clear=${f.clear.toFixed(1)}  slope0=${f.slope0.toFixed(2)}  frozen=${f.frozen.toFixed(1)}`);
  }
  console.log(`slot length ${WATER_SLOT} m`);
}
