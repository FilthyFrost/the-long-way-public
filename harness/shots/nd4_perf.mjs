// ND4's frame cost (docs/ND/PLAN.md): rendered frames driving the pickup with two bobbleheads nodding on its
// dashboard, and sitting in the motorhome with a tape playing in its deck and a plate and a frame on its wall — the
// ND systems' own milliseconds among them.
//   SHOTS_GPU=1 node harness/shots/nd4_perf.mjs [seed]
import { launchBrowser, openGame, startServer } from './lib.mjs';

const seed = process.argv[2] || '7';
const { server, url } = await startServer();
const browser = await launchBrowser();
const probe = (page) =>
  page.evaluate(() => {
    const g = window.__rt.game;
    g.systems.resetTimings?.();
    const t = [];
    for (let i = 0; i < 120; i++) {
      // (the step and the drawing: the screen's text refreshed besides every twentieth frame is the page's, not the game's)
      const a = performance.now();
      g.step(1 / 60);
      g.render();
      t.push(performance.now() - a);
    }
    t.sort((x, y) => x - y);
    const sys = g.systems.telemetry();
    const nd = Object.fromEntries(Object.entries(sys).filter(([k]) => k.startsWith('nd-')).map(([k, v]) => [k, +(v.ms?.total ?? 0).toFixed(3)]));
    return { median: +t[60].toFixed(2), p95: +t[114].toFixed(2), calls: g.core.stats.calls, nd };
  });
try {
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&time=15.6&weather=clear`, { width: 1280, height: 720 });
    await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 120; i++) g.simulate(1 / 30); });
    for (const [id, z] of [['nd_bobble_2', -0.02], ['nd_bobble_4', 0.2]]) {
      await page.evaluate((id) => window.__rt.hold(`item:${id}`), id);
      for (let i = 0; i < 40; i++) {
        if (await page.evaluate(() => !!window.__rt.game.cargo.boxOf(window.__rt.game.player.held))) break;
        await page.evaluate(() => window.__rt.game.simulate(1 / 10));
      }
      await page.evaluate((z) => { const g = window.__rt.game; const v = g.vehicles[0]; const at = g.cargo.spotIn(v, 'dash', g.player.held, { x: 0.74, z }, Math.PI); if (at) { g.cargo.stow(v, at.zone, at.spot, g.player.held); g.player.slots[g.player.sel] = null; } }, z);
    }
    await page.evaluate(() => { const g = window.__rt.game; window.__rt.setView('cockpit'); g.vehicles[0].sim.setParkBrake(false); window.__rt.crank(1.6); g.scripted = { steer: 0.15, throttle: 0.6, brake: 0, handbrake: 0 }; for (let i = 0; i < 120; i++) g.step(1 / 60, 1); });
    await probe(page);
    console.log('pickup driving, two bobbleheads nodding (after a first 120 frames)', JSON.stringify(await probe(page)));
    if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
    await page.close();
  }
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:rv&s=300&time=15.6&weather=clear`, { width: 1280, height: 720 });
    await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 120; i++) g.simulate(1 / 30); g.audio.start(); });
    await page.evaluate(() => window.__rt.hold('item:nd_tape_11'));
    await page.evaluate(() => window.__rt.game.systems.harness('nd-tape', 'insert'));
    await page.evaluate(() => { window.__rt.setView('cockpit'); window.__rt.look(0.3, -0.1); });
    await probe(page);
    console.log('motorhome seat, a tape playing (after a first 120 frames)', JSON.stringify(await probe(page)), JSON.stringify(await page.evaluate(() => window.__rt.game.systems.harness('nd-tape', 'heard'))));
    if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
