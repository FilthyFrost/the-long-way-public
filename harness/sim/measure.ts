/**
 * Run every headless measurement and write loop/metrics/*.json.
 *   npx tsx harness/sim/measure.ts [driving|roadgen|weather|all]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VEHICLES } from '../../src/core/vehicle/spec';
import { collectDrivingMetrics } from './scenarios';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = path.join(ROOT, 'loop/metrics');
fs.mkdirSync(outDir, { recursive: true });

function round(v: number): number {
  return Number.isFinite(v) ? Math.round(v * 1e4) / 1e4 : v;
}

export function writeMetrics(system: string, id: string, metrics: Record<string, number>): void {
  const clean: Record<string, number | null> = {};
  for (const [k, v] of Object.entries(metrics)) clean[k] = Number.isFinite(v) ? round(v) : null;
  fs.writeFileSync(path.join(outDir, `${system}_${id}.json`), JSON.stringify({ system, id, metrics: clean }, null, 2) + '\n');
}

const what = process.argv[2] ?? 'all';
const t0 = Date.now();
if (what === 'driving' || what === 'all') {
  const { collectVehicleMetrics } = await import('./vehicles');
  for (const spec of Object.values(VEHICLES)) {
    const m = { ...collectDrivingMetrics(spec), ...collectVehicleMetrics(spec) };
    writeMetrics('driving', spec.id, m);
    console.log(`driving/${spec.id}: ${Object.keys(m).length} metrics`);
  }
}
if (what === 'roadgen' || what === 'all') {
  try {
    const name = './roadgen';
    const mod = await import(name);
    const m = mod.collectRoadgenMetrics();
    writeMetrics('roadgen', 'default', m);
    console.log(`roadgen/default: ${Object.keys(m).length} metrics`);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
}
if (what === 'water' || what === 'roadgen' || what === 'all') {
  const { collectWaterMetrics } = await import('./water');
  const m = collectWaterMetrics();
  writeMetrics('roadgen', 'water', m);
  console.log(`roadgen/water: ${Object.keys(m).length} metrics`);
}
if (what === 'sites' || what === 'roadgen' || what === 'all') {
  const { collectSiteMetrics } = await import('./sites');
  const m = collectSiteMetrics();
  writeMetrics('roadgen', 'sites', m);
  console.log(`roadgen/sites: ${Object.keys(m).length} metrics`);
}
if (what === 'vista' || what === 'roadgen' || what === 'all') {
  const { collectVistaMetrics } = await import('./vista');
  const m = collectVistaMetrics();
  writeMetrics('roadgen', 'vista', m);
  console.log(`roadgen/vista: ${Object.keys(m).length} metrics`);
}
if (what === 'beats' || what === 'roadgen' || what === 'all') {
  const { collectBeatMetrics } = await import('./beats');
  const m = collectBeatMetrics();
  writeMetrics('roadgen', 'beats', m);
  console.log(`roadgen/beats: ${Object.keys(m).length} metrics`);
}
if (what === 'weather' || what === 'all') {
  try {
    const name = './weather';
    const mod = await import(name);
    const m = mod.collectWeatherMetrics();
    writeMetrics('weather', 'default', m);
    console.log(`weather/default: ${Object.keys(m).length} metrics`);
  } catch (e) {
    if ((e as { code?: string }).code !== 'ERR_MODULE_NOT_FOUND') throw e;
  }
}
if (what === 'look' || what === 'all') {
  const { collectLookMetrics } = await import('./look');
  const m = collectLookMetrics();
  writeMetrics('weather', 'look', m);
  console.log(`weather/look: ${Object.keys(m).length} metrics`);
}
if (what === 'audio' || what === 'all') {
  const { collectAudioMetrics } = await import('./audio');
  const m = collectAudioMetrics();
  writeMetrics('audio', 'default', m);
  console.log(`audio/default: ${Object.keys(m).length} metrics`);
}
if (what === 'economy' || what === 'all') {
  // the robot traveller: 3 × 550 km per vehicle, the four vehicles side by side (vehicle systems)
  const { spawn } = await import('node:child_process');
  const runs = Object.values(VEHICLES).map(
    (spec) =>
      new Promise<void>((resolve, reject) => {
        const p = spawn('npx', ['tsx', 'harness/sim/economy.ts', spec.id], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        p.stdout.on('data', (d) => (out += d));
        p.on('close', (code) => {
          if (code !== 0) return reject(new Error(`economy ${spec.id} exited ${code}`));
          const m = JSON.parse(out.trim().split('\n').at(-1)!) as Record<string, number>;
          writeMetrics('economy', spec.id, m);
          console.log(`economy/${spec.id}: ${Object.keys(m).length} metrics`);
          resolve();
        });
      }),
  );
  await Promise.all(runs);
}
console.log(`measured in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (what === 'onfoot' || what === 'all') {
  const { collectOnfootMetrics } = await import('./onfoot');
  const m = collectOnfootMetrics();
  writeMetrics('onfoot', 'default', m);
  console.log(`onfoot/default: ${Object.keys(m).length} metrics`);
}
