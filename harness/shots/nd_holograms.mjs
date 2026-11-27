// Step 4 verification: Nomad Drive 15 m glowing assembly holograms + under-hood gating + R-placement magnetic slot bridge.
//   SHOTS_GPU=1 node harness/shots/nd_holograms.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, mouseButton, openGame, startServer } from './lib.mjs';

const out = 'D:/cindy-scratch/phase2';
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const ok = (c, why) => {
  if (!c) bad++;
  console.log(c ? 'ok  ' : 'FAIL', why);
};

try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=11&weather=clear`, { width: 1280, height: 720 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (s) => ev((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); g.simulate(0); }, s);
  const shot = async (name) => {
    await rt('render');
    await page.screenshot({ path: path.join(out, `${name}.png`) });
  };

  // Get out and strip all 4 wheels + engine on vehicle 0
  await ev(() => {
    const g = window.__rt.game;
    if (g.seated) { g.seated.sim.setParkBrake(true); g.getOut(); }
  });
  await step(0.4);
  for (const m of ['hub_FL', 'hub_FR', 'hub_RL', 'hub_RR', 'engine']) await rt('remove', 0, m);
  await rt('openPanel', 0, 'hood', false);
  await step(0.5);

  // 1. Hold a rim 11 m away: ALL 4 empty hubs light up simultaneously (not just 1!)
  const car = await ev(() => {
    const v = window.__rt.game.vehicles[0];
    const b = new Float64Array(9);
    v.sim.basis(b);
    return { x: v.sim.px, y: v.sim.py, z: v.sim.pz, fx: b[0], fz: b[2], rx: b[6], rz: b[8] };
  });
  await rt('hold', 'rim_steel13');
  // Stand 10.5 m to the front-right quarter looking straight at the car
  await ev(({ car }) => {
    const g = window.__rt.game;
    const px = car.x + car.fx * 6.5 + car.rx * 8.2;
    const pz = car.z + car.fz * 6.5 + car.rz * 8.2;
    g.player.walker.place(px, pz, 0, 0);
    const l = g.player.walker.lookAt(car.x, car.y + 0.5, car.z);
    g.input.lookYaw = l.yaw;
    g.input.lookPitch = l.pitch;
    g.simulate(0);
  }, { car });
  await step(0.4);
  const visWheels = await ev(() => window.__rt.game.player.ghosts.visibleCount);
  ok(visWheels === 4, `all 4 empty wheel hubs glow simultaneously at ~10.5 m (visibleCount=${visWheels})`);
  await shot('01_four_wheels_11m');

  // 2. Hold an engine with hood CLOSED vs OPEN
  await rt('hold', 'eng_i4');
  await ev(({ car }) => {
    const g = window.__rt.game;
    const px = car.x + car.fx * 4.5 + car.rx * 2.2;
    const pz = car.z + car.fz * 4.5 + car.rz * 2.2;
    g.player.walker.place(px, pz, 0, 0);
    const l = g.player.walker.lookAt(car.x + car.fx * 1.3, car.y + 0.6, car.z);
    g.input.lookYaw = l.yaw;
    g.input.lookPitch = l.pitch;
    g.simulate(0);
  }, { car });
  await step(0.3);
  const visClosed = await ev(() => window.__rt.game.player.ghosts.visibleCount);
  ok(visClosed === 0, `under-hood empty engine slot stays hidden when hood is shut (visibleCount=${visClosed})`);
  await shot('02_hood_shut_no_ghost');

  await rt('openPanel', 0, 'hood', true);
  await step(0.4);
  const visOpen = await ev(() => window.__rt.game.player.ghosts.visibleCount);
  ok(visOpen === 1, `opening hood immediately lights glowing green engine hologram (visibleCount=${visOpen})`);
  await shot('03_hood_open_engine_ghost');

  // 3. Aim at engine slot + real-mouse Hold LMB 0.35 s -> instant snap install, ghosts vanish
  await rt('aim', 0, 'engine', 1.8);
  await step(0.2);
  await mouseButton(page, true);
  await step(0.45);
  await mouseButton(page, false);
  await step(0.2);
  const engAfter = await rt('part', 0, 'engine');
  const visAfterInstall = await ev(() => window.__rt.game.player.ghosts.visibleCount);
  ok(engAfter?.part === 'eng_i4' && visAfterInstall === 0, `real-mouse 0.35 s hold snaps engine in and clears ghosts (part=${engAfter?.part}, vis=${visAfterInstall})`);
  await shot('04_engine_snapped_in');

  // 4. R placement mode magnetic slot bridge: hold rim, enter R placement, aim at empty hub_FR -> snaps + LMB installs
  await rt('hold', 'rim_steel13');
  await rt('aim', 0, 'hub_FR', 1.7);
  await step(0.25);
  await ev(() => window.__rt.game.player.placer?.toggle());
  await step(0.25);
  const placeAim = await ev(() => ({
    placing: window.__rt.game.player.placer?.placing,
    words: document.querySelector('.mc-keys')?.textContent ?? '',
  }));
  ok(placeAim.placing && /安装/.test(placeAim.words), `R placement mode magnetically snaps car part to empty hub (${JSON.stringify(placeAim)})`);
  await shot('05_r_place_magnetic_snap');
  await mouseButton(page, true);
  await step(0.05);
  await mouseButton(page, false);
  await step(0.25);
  const rimAfter = await rt('part', 0, 'hub_FR');
  ok(rimAfter?.part === 'rim_steel13', `LMB in R placement mode installs magnetically snapped rim (part=${rimAfter?.part})`);

  // 5. Loose bare rim glows when holding a tyre
  await rt('hold', 'rim_steel13');
  await rt('drop');
  await step(0.5);
  await rt('hold', 'tire_road');
  await step(0.3);
  const visLooseRim = await ev(() => window.__rt.game.player.ghosts.visibleCount);
  ok(visLooseRim >= 2, `holding tyre lights both mounted bare hub_FR and loose bare rim (visibleCount=${visLooseRim})`);

  if (errors.length) ok(false, `page errors: ${errors.join('; ')}`);
  console.log(bad ? `nd_holograms: ${bad} FAILED` : 'nd_holograms: ok');
  process.exitCode = bad ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}
