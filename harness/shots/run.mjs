// Screenshot matrix runner.
//   node harness/shots/run.mjs [set ...] [--only name[,name…]] [--size 1280x720]
// Writes loop/shots/<set>/<name>.png and loop/metrics/render_<set>.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const onlyArg = flag('--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const size = (flag('--size') ?? '1280x720').split('x').map(Number);
const setsDir = path.join(ROOT, 'harness/shots/sets');
const names = args.length ? args : fs.readdirSync(setsDir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));

const { server, url } = await startServer();
const browser = await launchBrowser();
let failed = 0;
try {
  for (const setName of names) {
    const set = JSON.parse(fs.readFileSync(path.join(setsDir, `${setName}.json`), 'utf8'));
    const outDir = path.join(ROOT, 'loop/shots', set.set);
    fs.mkdirSync(outDir, { recursive: true });
    const report = { set: set.set, size, shots: {} };
    for (const shot of set.shots) {
      if (only && !only.has(shot.name)) continue;
      const t0 = Date.now();
      const q = [set.base, shot.params].filter(Boolean).join('&');
      let entry;
      try {
        // a set may open another page of the game (modcar.html, viewer.html); default index.html
        const { page, errors } = await openGame(browser, `${url}/${set.page ?? 'classic.html'}?${q}`, { width: size[0], height: size[1] });
        let drive = null;
        for (const step of shot.steps ?? []) {
          if (step.simulate !== undefined) await page.evaluate(([s, i]) => window.__rt.simulate(s, i), [step.simulate, step.input ?? null]);
          if (step.call) await page.evaluate(([fn, a]) => window.__rt[fn](...(a ?? [])), [step.call, step.args]);
          if (step.drive !== undefined) drive = await page.evaluate(([s, f]) => window.__rt.drive(s, f), [step.drive, step.fps ?? 30]);
        }
        let audio = null;
        if (shot.audioProbe) audio = await page.evaluate(() => window.__rt.audioProbe(600));
        // same seed must give the same road in the browser as in Node
        let hashOk = null;
        if (shot.checkHash) {
          const p = new URLSearchParams(q);
          const node = Number(execFileSync('npx', ['tsx', 'harness/sim/spinehash.ts', p.get('seed') ?? '20261113', p.get('chapter') ?? '1', p.get('biome') ?? 'plains', '2500'], { cwd: ROOT }).toString().trim());
          const web = await page.evaluate(() => window.__rt.spineHash(2500));
          hashOk = node === web;
          if (!hashOk) errors.push(`spine hash mismatch: node ${node} vs browser ${web}`);
        }
        if (shot.look) await page.evaluate(([y, p]) => window.__rt.look(y, p), shot.look);
        await page.evaluate(() => window.__rt.render());
        const file = path.join(outDir, `${shot.name}.png`);
        // software rendering: a heavy frame (storm, full cloud cube) can take a minute to reach the page
        await page.screenshot({ path: file, timeout: 120_000 });
        const tele = await page.evaluate(() => window.__rt.telemetry());
        entry = { ok: errors.length === 0, ms: Date.now() - t0, errors, calls: tele.calls, triangles: tele.triangles, programs: tele.programs, kmh: Math.round(tele.kmh * 10) / 10, exploded: tele.exploded, biome: tele.biome, drive, hashOk, audio };
        await page.close();
      } catch (e) {
        entry = { ok: false, ms: Date.now() - t0, errors: [String(e).slice(0, 400)] };
      }
      if (!entry.ok) failed++;
      report.shots[shot.name] = entry;
      console.log(`${entry.ok ? ' ok ' : 'FAIL'} ${set.set}/${shot.name}  ${entry.ms} ms  calls=${entry.calls ?? '-'} tris=${entry.triangles ?? '-'}${entry.errors.length ? '\n     ' + entry.errors.slice(0, 4).join('\n     ') : ''}`);
    }
    if (!only) {
      const list = Object.values(report.shots);
      const metrics = {
        shots_total: list.length,
        shots_failed: list.filter((s) => !s.ok).length,
        console_errors: list.reduce((n, s) => n + s.errors.length, 0),
        max_draw_calls: Math.max(0, ...list.map((s) => s.calls ?? 0)),
        max_triangles: Math.max(0, ...list.map((s) => s.triangles ?? 0)),
      };
      const drives = list.filter((s) => s.drive);
      if (drives.length) {
        metrics.stream_max_pending = Math.max(...drives.map((s) => s.drive.maxPending));
        metrics.stream_max_build_ms = Math.round(Math.max(...drives.map((s) => s.drive.maxBuildMs)) * 100) / 100;
        metrics.stream_cpu_ms_per_frame = Math.round(Math.max(...drives.map((s) => s.drive.cpuMsPerFrame)) * 100) / 100;
      }
      const audios = list.filter((s) => s.audio);
      if (audios.length) {
        metrics.audio_running = audios.every((s) => s.audio.running) ? 1 : 0;
        metrics.audio_min_rms = Math.round(Math.min(...audios.map((s) => s.audio.rms)) * 10000) / 10000;
      }
      const hashes = list.filter((s) => s.hashOk !== null && s.hashOk !== undefined);
      if (hashes.length) metrics.spine_hash_mismatches = hashes.filter((s) => !s.hashOk).length;
      fs.writeFileSync(path.join(ROOT, 'loop/metrics', `render_${set.set}.json`), JSON.stringify({ system: 'render', id: set.set, metrics, shots: report.shots }, null, 2) + '\n');
    }
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
