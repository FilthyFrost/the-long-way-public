// What is heard while driving, source by source (the player's "noise under everything"): the output's loudness
// with every source, then with each one taken off in turn — the engine, the foley (the tyres' rolls and slides),
// the old mixer's wind and road-noise voices, the ambience's beds.
//   SHOTS_GPU=1 node harness/shots/m4fix_noise_probe.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/modcar.html?new=1&world=2&seed=7&start=road&build=stock:pickup&time=12&weather=clear`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await page.evaluate(() => window.__rt.game.audio.start());
  await page.waitForFunction(() => window.__rt.game.soundStatus().decoded >= 150, null, { timeout: 120000 }).catch(() => null);
  await page.evaluate(() => {
    const rt = window.__rt;
    if (!rt.game.seated) rt.enter(0);
    rt.setView('cockpit');
  });
  // the engine running
  await page.evaluate(() => window.__rt.game.seated.sys.crank(true));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__rt.game.seated.sys.crank(false));
  console.log('running', await page.evaluate(() => window.__rt.game.seated.sys.running));
  const speed = () => page.evaluate(() => Math.hypot(window.__rt.game.seated.sim.vx, window.__rt.game.seated.sim.vz) * 3.6);
  const meter = () =>
    page.evaluate(async () => {
      const a = window.__rt.game.audio;
      let s = 0;
      for (let i = 0; i < 12; i++) {
        s += a.rms() ** 2;
        await new Promise((r) => setTimeout(r, 40));
      }
      return Math.sqrt(s / 12);
    });
  const toggle = (what, on) =>
    page.evaluate(
      ({ what, on }) => {
        const g = window.__rt.game;
        const n = g.audio.nodes;
        const node = { engine: g.voice?.out, foley: g.foley?.out, wind: n.windGain, road: n.roadGain }[what];
        const to = { engine: null, foley: null, wind: n.outside, road: n.master }[what];
        if (!node) return false;
        if (on) {
          if (what === 'engine') node.gain.value = node.__was ?? 1;
          else if (what === 'foley') node.gain.value = node.__was ?? 1;
          else node.connect(to);
        } else if (what === 'engine' || what === 'foley') {
          node.__was = node.gain.value;
          node.gain.value = 0;
        } else node.disconnect();
        return true;
      },
      { what, on },
    );
  const db = (x) => (20 * Math.log10(Math.max(1e-7, x))).toFixed(1);
  // a robot at the wheel holding a steady speed (each frame, before the game's own)
  await page.evaluate(async () => {
    const { RobotDriver } = await import('/src/core/driver/robot.ts');
    const g = window.__rt.game;
    const v = g.seated;
    v.sim.setParkBrake(false);
    window.__RobotDriver = RobotDriver;
    const f = g.frame.bind(g);
    g.frame = (dt) => {
      const r = window.__robot;
      if (r) {
        const inp = r.update(dt, v.sim, g.world.spine);
        g.scripted = { steer: inp.steer, throttle: inp.throttle, brake: inp.brake, handbrake: 0 };
      }
      f(dt);
    };
  });
  for (const target of [50, 90]) {
    await page.evaluate((cruise) => (window.__robot = new window.__RobotDriver({ lane: 1.8, cruise })), target / 3.6);
    for (let i = 0; i < 400 && Math.abs((await speed()) - target) > 3; i++) await page.waitForTimeout(100);
    await page.waitForTimeout(2500);
    const all = await meter();
    const parts = {};
    for (const what of ['engine', 'foley', 'wind', 'road']) {
      await toggle(what, false);
      await page.waitForTimeout(250);
      parts[what] = await meter();
      await toggle(what, true);
      await page.waitForTimeout(150);
    }
    const info = await page.evaluate(() => {
      const g = window.__rt.game;
      return { gains: g.audio.debug().gains, mix: { wind: g.audio.mix.windGain, road: g.audio.mix.roadGain, roadCutoff: g.audio.mix.roadCutoff, windCutoff: g.audio.mix.windCutoff }, tyres: (g.tyreNow?.loops ?? []).map((l) => `${l.name}:${l.gain.toFixed(2)}@${Math.round(l.cutoff ?? 0)}`), beds: g.ambience?.debug?.() ?? null };
    });
    console.log(`\n== at ${(await speed()).toFixed(0)} km/h: all ${db(all)} dB`);
    for (const [k, v] of Object.entries(parts)) console.log(`  without ${k.padEnd(6)} ${db(v)} dB  (${k}'s share ${(100 * (1 - (v * v) / (all * all))).toFixed(0)}% of the power)`);
    console.log('  ', JSON.stringify(info));
  }
  if (errors.length) console.log('errors', errors.slice(0, 3).join(' | '));
} finally {
  await browser.close();
  await server.close();
}
