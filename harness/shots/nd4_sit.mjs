// ND4's furniture sat on and carried (docs/ND/PLAN.md): the cabin's sofa sat on (the view from it, turned as far as
// it goes), stood up from with Q held; its chair sat on; the speed one walks with a chair, a sofa and the kitchen
// stand in the hands against a big thing of the game's own.
//   SHOTS_GPU=1 node harness/shots/nd4_sit.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd4');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&nd=cabin&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      await step(4);
      const st = await page.evaluate(() => ({ pending: window.__rt.worldPending(), drawn: window.__rt.game.systems.harness('nd-build', 'drawn') }));
      if (st.pending <= 0 && st.drawn.length && st.drawn.every((d) => d.ready)) break;
    }
    await page.evaluate(() => window.__rt.game.loose.settled());
    await step(8);
  };
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  const P = (await H('nd-build', 'places')).find((p) => p.prefab === 'cabin');
  if (!P) throw new Error('no cabin laid');
  const W = (u, v) => ({ x: P.x + Math.cos(P.yaw) * u - Math.sin(P.yaw) * v, z: P.z + Math.sin(P.yaw) * u + Math.cos(P.yaw) * v });
  await page.evaluate(({ x, z }) => { const g = window.__rt.game; g.teleportTo(x, z, 0, true); g.simulate(0); }, W(-7, -8));
  await settle();
  await H('nd-build', 'door', P.id, true);
  const pieces = await H('nd-home', 'pieces');
  const of = (id) => pieces.find((p) => p.item === id);
  const sofa = of('nd_sofa');
  const chair = of('nd_chair');
  console.log('sofa', JSON.stringify(sofa), 'chair', JSON.stringify(chair));
  // beside the sofa, then sat down on its first seat
  const eyeY = () => page.evaluate(() => { const w = window.__rt.game.player.walker; const e = w.eye(); return { eye: +(e.y - w.y).toFixed(3), feet: +w.y.toFixed(2), x: +w.x.toFixed(2), z: +w.z.toFixed(2), yaw: +window.__rt.game.input.lookYaw.toFixed(2) }; });
  if (sofa) {
    await page.evaluate(({ s }) => window.__rt.stand(s.x + 1.2, s.z + 0.4, Math.atan2(-0.4, -1.2), -0.1), { s: sofa });
    await step(4);
    console.log('sat', await H('nd-home', 'sit', sofa.uid, 0));
    await frames(40);
    console.log('on the sofa', JSON.stringify(await eyeY()), JSON.stringify(await H('nd-home', 'sitting')));
    await page.evaluate(() => { window.__rt.game.input.lookPitch = -0.08; });
    await frames(4);
    await shot('01_on_the_sofa.png');
    // turned as far as it goes (125° to one side)
    await page.evaluate(() => { window.__rt.game.input.lookYaw += 3.0; });
    await frames(4);
    await shot('02_sofa_turned_far.png', JSON.stringify(await eyeY()));
    // up again: Q held
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' })));
    await frames(30);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ' })));
    await frames(30);
    console.log('stood up', JSON.stringify(await H('nd-home', 'sitting')), JSON.stringify(await eyeY()));
  }
  if (chair) {
    await page.evaluate(({ s }) => window.__rt.stand(s.x + 1.0, s.z + 0.6, Math.atan2(-0.6, -1.0), -0.1), { s: chair });
    await step(4);
    console.log('sat', await H('nd-home', 'sit', chair.uid, 0));
    await frames(40);
    await page.evaluate(() => { window.__rt.game.input.lookPitch = -0.1; });
    await frames(4);
    await shot('03_on_the_chair.png', JSON.stringify(await eyeY()));
    await H('nd-home', 'stand');
    await frames(20);
  }
  // how fast one walks with things in the hands
  const speeds = await page.evaluate(() => {
    const g = window.__rt.game;
    const out = {};
    for (const id of ['', 'item:nd_chair', 'item:nd_sofa', 'item:nd_kitchen_stand', 'item:junk_trolley']) {
      const p = g.player;
      p.slots[p.sel] = null;
      if (id) window.__rt.hold(id);
      g.simulate(0);
      const w = p.walker;
      out[id || 'empty'] = { walk: +w.topSpeed(false).toFixed(2), run: +w.topSpeed(true).toFixed(2), load: w.load, share: w.loadShare, mayRun: w.loadRun };
    }
    return out;
  });
  console.log('speeds', JSON.stringify(speeds));
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
