// What the tyres sound like as the car pulls away (the player: "起步的时候轮胎摩擦的声音…太尖太薄"): from standing,
// the throttle opened as a driver opens it — gently, then hard — the tyres' loops logged every tenth of a second.
//   SHOTS_GPU=1 node harness/shots/m4fix_launch_probe.mjs [build]
import { launchBrowser, startServer } from './lib.mjs';

const build = process.argv[2] ?? 'stock:pickup';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/modcar.html?new=1&world=2&seed=7&start=road&build=${build}&time=12&weather=clear`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await page.evaluate(() => window.__rt.game.audio.start());
  await page.evaluate(() => {
    const rt = window.__rt;
    if (!rt.game.seated) rt.enter(0);
    rt.setView('cockpit');
  });
  await page.evaluate(() => window.__rt.game.seated.sys.crank(true));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__rt.game.seated.sys.crank(false));
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.seated;
    v.sim.setParkBrake(false);
    window.__log = [];
    const f = g.frame.bind(g);
    let t = 0;
    g.frame = (dt) => {
      const p = window.__pedal;
      if (p) {
        t += dt;
        g.scripted = { steer: 0, throttle: p(t), brake: 0, handbrake: 0 };
      }
      f(dt);
      if (p && Math.floor(t * 10) !== Math.floor((t - dt) * 10)) {
        const w = v.sim.wheels;
        window.__log.push({
          t: +t.toFixed(1),
          kmh: +v.sim.kmh.toFixed(1),
          thr: +p(t).toFixed(2),
          slip: w.map((wh) => +((wh.omega * wh.radius - wh.vLong) / Math.max(1, Math.abs(wh.vLong))).toFixed(2)).join(' '),
          loops: (g.tyreNow?.loops ?? []).map((l) => `${l.name}:${l.gain.toFixed(2)}x${l.rate.toFixed(2)}`).join(' '),
        });
      }
    };
  });
  for (const [name, pedal] of [
    ['gentle', '(t) => Math.min(0.35, t * 0.5)'],
    ['hard', '(t) => Math.min(1, t * 4)'],
  ]) {
    // stopped, then the pedal
    await page.evaluate(() => {
      window.__pedal = null;
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 1, handbrake: 0 };
    });
    await page.waitForTimeout(2500);
    await page.evaluate((src) => {
      window.__log = [];
      window.__pedal = eval(src);
    }, pedal);
    await page.waitForTimeout(3200);
    const log = await page.evaluate(() => window.__log);
    console.log(`\n== ${name} launch (${build})`);
    for (const r of log.slice(0, 30)) console.log(`  t ${r.t.toFixed(1)}  ${String(r.kmh).padStart(5)} km/h  pedal ${r.thr}  slip ${r.slip}  ${r.loops}`);
  }
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
