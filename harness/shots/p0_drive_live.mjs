// Frames as the player gets them while driving (docs/V3/nodes/P0-perf.md): the game in its own loop (the browser's
// animation frames, as in play, not stepped by the harness), a robot at the wheel at 80 km/h, every frame's interval
// recorded — 16.7 ms is a frame on time at 60 Hz; a frame of 33 ms is one dropped.
//   SHOTS_GPU=1 node harness/shots/p0_drive_live.mjs [km]
import { launchBrowser, startServer } from './lib.mjs';

const km = Number(process.argv[2] ?? 3);
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/modcar.html?new=1&world=2&seed=7&start=road&build=stock:pickup&time=15.5&weather=clear`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await page.waitForTimeout(6000);
  await page.evaluate(async (km) => {
    const rt = window.__rt;
    const g = rt.game;
    if (!g.seated) g.enter(g.focus, 'driver');
    g.ui.root.style.visibility = 'hidden';
    rt.setView('cockpit');
    const { RobotDriver } = await import('/src/core/driver/robot.ts');
    const v = g.seated;
    v.sim.setParkBrake(false);
    const robot = new RobotDriver({ lane: 0.7, cruise: 80 / 3.6, latG: 0.2 });
    const p = { s: 0, d: 0 };
    g.world.spine.project(v.sim.px, v.sim.pz, NaN, p);
    robot.s = p.s;
    const end = robot.s + km * 1000;
    window.__live = { intervals: [], kms: [], done: false };
    const f = g.frame.bind(g);
    let last = 0;
    g.frame = (dt) => {
      g.scripted = robot.update(dt, v.sim, g.world.spine);
      f(dt);
      const now = performance.now();
      if (last) {
        window.__live.intervals.push(now - last);
        window.__live.kms.push(robot.s / 1000);
      }
      last = now;
      if (robot.s >= end) window.__live.done = true;
    };
  }, km);
  await page.waitForFunction(() => window.__live.done, null, { timeout: 900000, polling: 1000 });
  const r = await page.evaluate(() => window.__live);
  const iv = r.intervals.slice(60);
  const sorted = [...iv].sort((a, b) => a - b);
  const q = (f) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))].toFixed(1);
  const late = iv.filter((x) => x > 20).length;
  const long = iv.filter((x) => x > 50).length;
  console.log(`${iv.length} frames over ${km} km: mean interval ${(iv.reduce((a, b) => a + b, 0) / iv.length).toFixed(2)} ms (${(1000 / (iv.reduce((a, b) => a + b, 0) / iv.length)).toFixed(1)} fps), P50 ${q(0.5)}, P95 ${q(0.95)}, P99 ${q(0.99)}, max ${sorted[sorted.length - 1].toFixed(1)}`);
  console.log(`  late frames (> 20 ms: at least one dropped) ${late} = ${((100 * late) / iv.length).toFixed(2)}%; hitches over 50 ms ${long}`);
  const worst = iv.map((x, i) => [x, r.kms[i + 60]]).sort((a, b) => b[0] - a[0]).slice(0, 8);
  console.log('  the longest:', worst.map(([x, k]) => `${x.toFixed(0)} ms at ${k.toFixed(2)} km`).join(', '));
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
