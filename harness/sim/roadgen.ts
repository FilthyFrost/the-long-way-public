/**
 * Headless checks of road and terrain generation, plus the robot driver on generated roads.
 * FULL=1 in the environment runs the long version (more seeds, longer drives).
 */
import { RobotDriver } from '../../src/core/driver/robot';
import { Rng } from '../../src/core/math/rng';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { T0_TRUCK, type VehicleSpec } from '../../src/core/vehicle/spec';
import { BIOMES, MIN_RADIUS_ANY, minRadius } from '../../src/core/world/biomes';
import { BiomeBlend, RoadSpine, SpineSample } from '../../src/core/world/spine';
import { ROAD_EDGE, ROAD_HALF, TerrainPoint, World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const DEG = 180 / Math.PI;
const FULL = process.env.FULL === '1';

function spineChecks(): Metrics {
  const seeds = FULL ? 1000 : 150;
  const len = 30000;
  let maxPhi = 0;
  let maxGrade = 0;
  let maxKappa = 0;
  let curvViol = 0;
  let maxKRate = 0;
  let maxGRate = 0;
  let minCos = 1;
  let maxBank = 0;
  let mism = 0;
  let straight = 0;
  let total = 0;
  const bl = new BiomeBlend();
  const biomeKm = new Array(BIOMES.length).fill(0);
  for (let seed = 1; seed <= seeds; seed++) {
    const sp = new RoadSpine(seed, { chapterScale: 0.25 });
    sp.ensure(len);
    const n = Math.floor(len / sp.ds);
    for (let i = 1; i < n; i++) {
      const phi = Math.abs(sp.phi[i]);
      if (phi > maxPhi) maxPhi = phi;
      const g = Math.abs(sp.grd[i]);
      if (g > maxGrade) maxGrade = g;
      const k = Math.abs(sp.kap[i]);
      if (k > maxKappa) maxKappa = k;
      sp.biomeAt(i * sp.ds, bl);
      const rMin = Math.max(MIN_RADIUS_ANY, minRadius(BIOMES[bl.a].designKmh) + (minRadius(BIOMES[bl.b].designKmh) - minRadius(BIOMES[bl.a].designKmh)) * bl.t);
      // a curve begun in a slow biome may run a little into a faster one while it unwinds: allow 25%
      if (k * rMin > 1.25) curvViol++;
      const kr = Math.abs(sp.kap[i] - sp.kap[i - 1]) / sp.ds;
      if (kr > maxKRate) maxKRate = kr;
      const gr = Math.abs(sp.grd[i] - sp.grd[i - 1]) / sp.ds;
      if (gr > maxGRate) maxGRate = gr;
      const c = (sp.xs[i] - sp.xs[i - 1]) / sp.ds;
      if (c < minCos) minCos = c;
      const b = Math.abs(sp.bnk[i]);
      if (b > maxBank) maxBank = b;
      if (k < 1e-5) straight++;
      total++;
      biomeKm[bl.t < 0.5 ? bl.a : bl.b] += sp.ds / 1000;
    }
    // determinism: a second generator, grown in small bites, must give the same road
    if (seed <= 40) {
      const sp2 = new RoadSpine(seed, { chapterScale: 0.25 });
      for (let s = 0; s < 6000; s += 137) sp2.ensure(s);
      if (sp2.hash(2500) !== sp.hash(2500)) mism++;
    }
  }
  const out: Metrics = {
    spine_seeds: seeds,
    spine_max_heading_deg: maxPhi * DEG,
    spine_max_grade_pct: maxGrade * 100,
    spine_min_radius_m: 1 / maxKappa,
    spine_curvature_violations: curvViol,
    spine_max_curvature_rate: maxKRate * 1e6,
    spine_max_grade_rate: maxGRate * 1e6,
    spine_min_forward_cos: minCos,
    spine_max_bank_pct: maxBank * 100,
    spine_determinism_mismatches: mism,
    spine_straight_fraction: straight / total,
  };
  BIOMES.forEach((b, i) => (out[`spine_km_${b.id}`] = biomeKm[i] / seeds));
  return out;
}

function terrainChecks(): Metrics {
  const seeds = FULL ? 40 : 10;
  const tp = new TerrainPoint();
  const st = new SpineSample();
  let surfaceErr = 0;
  let projErr = 0;
  let seam = 0;
  let maxStepNear = 0;
  let maxKink = 0;
  let maxVergeSlope = 0;
  let samples = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const w = new World(seed * 31 + 7, { chapterScale: 0.25 });
    const sp = w.spine;
    const rng = new Rng(seed);
    sp.ensure(24000);
    for (let k = 0; k < 6000; k++) {
      const s = rng.range(50, 22000);
      sp.at(s, st);
      const nx = -Math.sin(st.phi);
      const nz = Math.cos(st.phi);
      // 1) on the paved surface the height is exactly the road plane
      let d = rng.range(-ROAD_HALF + 0.05, ROAD_HALF - 0.05);
      w.shape(st.x + nx * d, st.z + nz * d, tp);
      if (tp.zone !== 1 || Math.abs(tp.h - (st.y + st.bank * d)) > 0.01 || Math.abs(tp.d - d) > 0.03) surfaceErr++;
      // 2) points near the road must find a road point at least as close as the one they came from
      d = rng.range(-58, 58);
      w.shape(st.x + nx * d, st.z + nz * d, tp);
      if (Math.abs(tp.d) > Math.abs(d) + 0.05) projErr++;
      // 3) seams at the pavement edge and the shoulder edge
      for (const edge of [ROAD_HALF, ROAD_EDGE]) {
        for (const sg of [-1, 1]) {
          const a = w.heightAt(st.x + nx * sg * (edge - 0.01), st.z + nz * sg * (edge - 0.01));
          const b = w.heightAt(st.x + nx * sg * (edge + 0.01), st.z + nz * sg * (edge + 0.01));
          // remove the expected slope across 2 cm
          const gap = Math.abs(b - a) - 0.02 * 0.2;
          if (gap > seam) seam = gap;
        }
      }
      // 4) verge slope right next to the shoulder
      const side = rng.chance(0.5) ? 1 : -1;
      const h1 = w.heightAt(st.x + nx * side * 6, st.z + nz * side * 6);
      const h2 = w.heightAt(st.x + nx * side * 9, st.z + nz * side * 9);
      const sl = Math.abs(h2 - h1) / 3;
      if (sl > maxVergeSlope) maxVergeSlope = sl;
      samples++;
    }
    // 5) continuity: straight walks across the corridor
    for (let k = 0; k < 60; k++) {
      const s = rng.range(200, 22000);
      sp.at(s, st);
      const ang = rng.range(0, Math.PI * 2);
      const dx = Math.cos(ang) * 0.5;
      const dz = Math.sin(ang) * 0.5;
      let x = st.x - dx * 500;
      let z = st.z - dz * 500;
      // (the land itself: a bridge deck is laid over it and ends in a drop at its edge, by design)
      w.shape(x, z, tp);
      let hPrev = tp.bed;
      let hPrev2 = hPrev;
      for (let i = 0; i < 1000; i++) {
        x += dx;
        z += dz;
        w.shape(x, z, tp);
        const h = tp.bed;
        const step = Math.abs(h - hPrev);
        if (Math.abs(tp.d) < 150 && step > maxStepNear) maxStepNear = step;
        // a kink (second difference) larger than any real slope change signals a discontinuity
        const kink = Math.abs(h - 2 * hPrev + hPrev2);
        if (i > 1 && kink > maxKink) maxKink = kink;
        hPrev2 = hPrev;
        hPrev = h;
      }
    }
  }
  // 6) cost
  const w = new World(4242, { chapterScale: 0.25 });
  w.spine.ensure(8000);
  const sp = w.spine;
  sp.at(3000, st);
  // Timings are taken in many batches and the low end reported (the third fastest in twenty: the lower
  // quartile of twenty, the third of sixty): what the code costs, not what else the machine happened
  // to be doing. With three other agents' tests and renders beside this one on eight cores, a quarter
  // of twenty batches were all interrupted at times; sixty short ones always have a few clean runs.
  const quartile = (ts: number[]): number => ts.sort((p, q) => p - q)[Math.min(Math.floor(ts.length / 4), 2)];
  let acc = 0;
  const N = 60000;
  const batches: number[] = [];
  for (let b = 0; b < 6; b++) {
    const t0 = performance.now();
    for (let i = (b * N) / 6; i < ((b + 1) * N) / 6; i++) acc += w.heightAt(st.x + ((i * 7) % 400) - 200, st.z + ((i * 13) % 600) - 300);
    batches.push(((performance.now() - t0) * 1000) / (N / 6));
  }
  const usPer = quartile(batches);
  const chunks: number[] = [];
  for (let c = 0; c < 60; c++) {
    const t0 = performance.now();
    for (let j = 0; j < 67; j++) for (let i = 0; i < 67; i++) acc += w.heightAt(st.x + (c % 20) * 128 + i * 2, st.z + 100 + j * 2);
    chunks.push(performance.now() - t0);
  }
  const chunkMs = quartile(chunks);
  return {
    terrain_samples: samples,
    terrain_road_surface_errors: surfaceErr,
    terrain_projection_errors: projErr,
    terrain_road_seam_gap_cm: seam * 100,
    terrain_max_step_near_m: maxStepNear,
    terrain_max_kink_m: maxKink,
    terrain_max_verge_slope: maxVergeSlope,
    terrain_height_us: usPer,
    terrain_chunk_ms: chunkMs,
    terrain_checksum: Number.isFinite(acc) ? 1 : 0,
  };
}

export interface RobotRun {
  spec?: VehicleSpec;
  /** cruise speed (km/h) and the lateral g the driver plans its corner speeds for */
  cruiseKmh?: number;
  latG?: number;
  km?: number;
}

export function robotChecks(prefix = 'robot', wetness = 0, snowCover = 0, seedCount = FULL ? 100 : 24, run: RobotRun = {}): Metrics {
  const seeds = seedCount;
  const km = run.km ?? (FULL ? 5 : 4);
  const spec = run.spec ?? T0_TRUCK;
  let sumSq = 0;
  let n = 0;
  let maxErr = 0;
  let offroad = 0;
  let flips = 0;
  let stuck = 0;
  let exploded = 0;
  let dist = 0;
  let time = 0;
  let maxLatG = 0;
  const b = new Float64Array(9);
  const lane = 1.6;
  for (let seed = 1; seed <= seeds; seed++) {
    const w = new World(seed * 101 + 3, { chapterScale: 0.2 });
    w.wetness = wetness;
    w.snowCover = snowCover;
    const sp = w.spine;
    const st = new SpineSample();
    const start = 40;
    sp.at(start, st);
    const v = new VehicleSim(spec);
    v.reset(st.x - Math.sin(st.phi) * lane, st.y, st.z + Math.cos(st.phi) * lane, -st.phi);
    const robot = new RobotDriver({ cruise: (run.cruiseKmh ?? 62) / 3.6, lane, latG: run.latG ?? 0.28 });
    robot.s = start;
    let slow = 0;
    let out = false;
    let ended = false;
    const maxT = (km * 1000) / 4;
    for (let t = 0; t < maxT && !ended; t += v.h) {
      const inp = robot.update(v.h, v, sp);
      v.substep(inp, w);
      if (v.exploded) {
        exploded++;
        break;
      }
      if (t > 4) {
        const e = robot.d - lane;
        sumSq += e * e;
        n++;
        if (Math.abs(e) > maxErr) maxErr = Math.abs(e);
        const ay = Math.abs(v.vForward * v.yawRate) / 9.81;
        if (ay > maxLatG) maxLatG = ay;
      }
      const offNow = Math.abs(robot.d) > ROAD_EDGE;
      if (offNow && !out) offroad++;
      out = offNow;
      v.basis(b);
      if (b[4] < 0.3) {
        flips++;
        break;
      }
      if (t > 8 && v.speed < 1) {
        slow += v.h;
        if (slow > 6) {
          stuck++;
          break;
        }
      } else slow = 0;
      if (robot.s - start >= km * 1000) ended = true;
    }
    dist += (robot.s - start) / 1000;
    time += v.time;
  }
  return {
    [`${prefix}_seeds`]: seeds,
    [`${prefix}_km`]: dist,
    [`${prefix}_lane_rms_m`]: Math.sqrt(sumSq / Math.max(1, n)),
    [`${prefix}_max_lane_error_m`]: maxErr,
    [`${prefix}_offroad_events`]: offroad,
    [`${prefix}_flips`]: flips,
    [`${prefix}_stuck`]: stuck,
    [`${prefix}_exploded`]: exploded,
    [`${prefix}_accidents_per_100km`]: ((offroad + flips + stuck + exploded) / Math.max(0.001, dist)) * 100,
    [`${prefix}_mean_kmh`]: (dist / (time / 3600)) || 0,
    [`${prefix}_max_lat_g`]: maxLatG,
  };
}

export function collectRoadgenMetrics(): Metrics {
  // the same roads again in the rain and on fresh snow: a careful driver must still arrive
  return { ...spineChecks(), ...terrainChecks(), ...robotChecks(), ...robotChecks('robot_wet', 1, 0, FULL ? 40 : 10), ...robotChecks('robot_snow', 0, 1, FULL ? 40 : 10) };
}
