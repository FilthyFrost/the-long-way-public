// What a frame that takes long while driving is spending its time on (docs/V3/nodes/P0-perf.md): a robot drives the
// road of seed 7 at 80 km/h; each frame is timed in two parts — the game's step (the simulation, and the world built
// as it comes: terrain, plants, places, life) and the drawing (with the GPU's work, read back) — and what the renderer
// took on in it is noted: shaders compiled, geometries and textures made. The frames over 40 ms are listed.
//   SHOTS_GPU=1 node harness/shots/p0_drive_profile.mjs [from km] [to km]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const fromKm = Number(process.argv[2] ?? 0.1);
const toKm = Number(process.argv[3] ?? 9);
const out = path.join(ROOT, 'loop/shots/p0_drive');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:pickup&s=${Math.round(fromKm * 1000)}&time=15.5&weather=clear`, { width: 1920, height: 1080 });
  await page.evaluate(async () => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    g.ui.root.style.visibility = 'hidden';
    rt.setView('cockpit');
    const { RobotDriver } = await import('/src/core/driver/robot.ts');
    const robot = new RobotDriver({ lane: 0.7, cruise: 80 / 3.6, latG: 0.2 });
    const sim = g.seated.sim;
    sim.setParkBrake(false);
    const p = { s: 0, d: 0 };
    g.world.spine.project(sim.px, sim.pz, NaN, p);
    robot.s = p.s;
    const gl = g.core.renderer.getContext();
    const px = new Uint8Array(4);
    const info = g.core.renderer.info;
    // (what a vehicle costs when it comes: its parts merged, a wreck spawned)
    window.__merge = 0;
    window.__spawn = 0;
    const proto = Object.getPrototypeOf(g.vehicles[0].view);
    const tm = proto.tryMerge;
    proto.tryMerge = function () { const t = performance.now(); const r = tm.call(this); window.__merge += performance.now() - t; return r; };
    if (g.wrecks) { const sp = g.wrecks.spawn; g.wrecks.spawn = function (...a) { const t = performance.now(); const r = sp.apply(this, a); window.__spawn += performance.now() - t; return r; }; }
    window.__drive = (target) => {
      const rows = [];
      for (let i = 0; i < 300 && robot.s < target; i++) {
        const a0 = info.programs?.length ?? 0;
        const seen0 = new Set(info.programs ?? []);
        const g0 = info.memory.geometries;
        const x0 = info.memory.textures;
        window.__merge = 0;
        window.__spawn = 0;
        const crownsChanged = !!g.worldView?.crowns?.changed;
        const t0 = performance.now();
        g.scripted = robot.update(1 / 60, sim, g.world.spine);
        g.step(1 / 60, 1);
        const t1 = performance.now();
        g.render();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const t2 = performance.now();
        const fresh = (info.programs ?? []).filter((p) => !seen0.has(p)).map((p) => p.name || p.cacheKey?.slice(0, 40) || "?");
        rows.push({ calls: g.core.stats.calls, tris: g.core.stats.triangles, crowns: crownsChanged, merge: +window.__merge.toFixed(1), spawn: +window.__spawn.toFixed(1), fresh, km: +(robot.s / 1000).toFixed(3), ms: +(t2 - t0).toFixed(1), step: +(t1 - t0).toFixed(1), draw: +(t2 - t1).toFixed(1), shaders: (info.programs?.length ?? 0) - a0, geos: info.memory.geometries - g0, texs: info.memory.textures - x0, pending: rt.worldPending() });
      }
      return rows;
    };
  });
  const rows = [];
  for (;;) {
    const part = await page.evaluate((t) => window.__drive(t), toKm * 1000);
    if (!part.length) break;
    rows.push(...part);
    if (part[part.length - 1].km >= toKm) break;
  }
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const q = (f) => ms[Math.min(ms.length - 1, Math.floor(f * ms.length))];
  console.log(`${rows.length} frames, ${fromKm}–${toKm} km: mean ${(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2)} ms, P95 ${q(0.95)}, P99 ${q(0.99)}, max ${ms[ms.length - 1]}`);
  const steps = rows.map((r) => r.step).sort((a, b) => a - b);
  const draws = rows.map((r) => r.draw).sort((a, b) => a - b);
  console.log(`  the step: mean ${(steps.reduce((a, b) => a + b, 0) / steps.length).toFixed(2)}, P95 ${steps[Math.floor(0.95 * steps.length)]}; the drawing: mean ${(draws.reduce((a, b) => a + b, 0) / draws.length).toFixed(2)}, P95 ${draws[Math.floor(0.95 * draws.length)]}`);
  const slow = rows.filter((r) => r.ms > 40);
  console.log(`${slow.length} frames over 40 ms:`);
  for (const r of slow.slice(0, 40)) console.log(`  ${r.km.toFixed(3)} km  ${String(r.ms).padStart(7)} ms  step ${String(r.step).padStart(7)}  draw ${String(r.draw).padStart(7)}  +${r.shaders} shaders  +${r.geos} geometries  +${r.texs} textures  pending ${r.pending}  merge ${r.merge}  spawn ${r.spawn}${r.fresh.length ? "  [" + r.fresh.join(", ") + "]" : ""}`);
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify(rows));
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
