// ND3's other tools in the game (docs/ND/PLAN.md): the compass in the hands (its lid open, its needle to the north);
// the polisher on the pickup's faded body; an engine repair kit on a worn engine and a charger on a flat battery lying
// about (E held, the kit used up); a worn sponge rinsed in a bucket of water.
//   SHOTS_GPU=1 node harness/shots/nd3_tools.mjs [seed] [hour]
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/nd3');
fs.mkdirSync(out, { recursive: true });
const seed = process.argv[2] || '7';
const hour = process.argv[3] || '15.6';
const { server, url } = await startServer();
const browser = await launchBrowser();
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=${seed}&start=road&build=stock:pickup&time=${hour}&weather=clear`, { width: 1280, height: 720 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const frames = (n) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.step(1 / 60, 1); }, n);
  const H = (sys, fn, ...a) => page.evaluate(({ sys, fn, a }) => window.__rt.game.systems.harness(sys, fn, ...a), { sys, fn, a });
  const shot = async (f, extra = '') => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
    console.log('shot', f, extra);
  };
  for (let i = 0; i < 30; i++) await step(4);
  await page.evaluate(() => window.__rt.game.loose.settled());
  // out of the pickup, beside it
  const v = await page.evaluate(() => { const g = window.__rt.game; const v = g.vehicles[0]; return { x: v.sim.px, z: v.sim.pz, h: v.sim.heading ?? 0 }; });
  await page.evaluate(({ v }) => window.__rt.stand(v.x + 4, v.z + 3, Math.atan2(-3, -4), -0.25), { v });
  await step(6);
  // the compass
  await page.evaluate(() => window.__rt.hold('item:nd_compass'));
  await page.evaluate(() => { const g = window.__rt.game; g.input.lookPitch = -0.7; g.simulate(0); });
  await frames(60);
  await shot('30_compass.png', JSON.stringify(await H('nd-kit', 'compass')));
  // the polisher on the pickup's faded body
  await page.evaluate(() => { const v = window.__rt.game.vehicles[0]; v.build.cond = 0.2; v.build.polish = 0; v.changed(); });
  await page.evaluate(() => window.__rt.hold('item:nd_polisher'));
  await page.evaluate(({ v }) => window.__rt.aimPoint(v.x, 1.0 + window.__rt.game.world.heightAt(v.x, v.z), v.z, Math.atan2(3, 4), 1.9), { v });
  console.log('target', await page.evaluate(() => window.__rt.game.player.telemetry().target));
  await H('nd-polisher', 'run', true);
  await frames(150);
  await shot('31_polisher_on_the_body.png', JSON.stringify(await H('nd-polisher', 'shine')));
  await H('nd-polisher', 'run', false);
  await frames(30);
  console.log('body polish', await page.evaluate(() => window.__rt.game.vehicles[0].build.polish));
  // an engine kit on a worn engine lying about
  await page.evaluate(() => { const g = window.__rt.game; const p = g.player; p.slots[p.sel] = null; });
  await page.evaluate(() => window.__rt.hold('eng_i4'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.inst.cond = 0.3; });
  await page.evaluate(({ v }) => window.__rt.stand(v.x + 5, v.z + 4, 0, -0.7), { v });
  await page.evaluate(() => window.__rt.drop());
  await frames(40);
  await page.evaluate(() => window.__rt.hold('item:nd_engine_kit'));
  console.log('aim engine', await page.evaluate(() => window.__rt.aimLoose('eng_i4', 1.1)));
  await page.evaluate(() => { const g = window.__rt.game; g.player.press(); for (let i = 0; i < 18; i++) { g.player.primary = true; g.step(1 / 60, 1); } });
  await shot('32_engine_kit_holding.png', JSON.stringify(await page.evaluate(() => window.__rt.game.player.progress)));
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 20; i++) { g.player.primary = true; g.step(1 / 60, 1); } g.player.release(); g.simulate(0); });
  console.log('engine cond', await page.evaluate(() => window.__rt.game.loose.list.find((l) => l.part?.part === 'eng_i4')?.part.cond), 'held', await page.evaluate(() => window.__rt.game.player.held?.item?.item ?? null));
  // a charger on a flat battery lying about
  await page.evaluate(() => window.__rt.hold('bat_std'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.inst.fluids.charge = 0.15; });
  await page.evaluate(({ v }) => window.__rt.stand(v.x + 6.5, v.z + 4, 0, -0.7), { v });
  await page.evaluate(() => window.__rt.drop());
  await frames(40);
  await page.evaluate(() => window.__rt.hold('item:nd_charger'));
  console.log('aim battery', await page.evaluate(() => window.__rt.aimLoose('bat_std', 1.1)));
  await page.evaluate(() => { const g = window.__rt.game; g.player.press(); for (let i = 0; i < 40; i++) { g.player.primary = true; g.step(1 / 60, 1); } g.player.release(); g.simulate(0); });
  await frames(4);
  await shot('33_charger_done.png', JSON.stringify(await page.evaluate(() => window.__rt.game.loose.list.find((l) => l.part?.part === 'bat_std')?.part.fluids.charge)));
  // a worn sponge rinsed in a bucket of water
  await page.evaluate(() => window.__rt.hold('item:nd_bucket'));
  await page.evaluate(() => { const h = window.__rt.game.player.held; h.item.litres = 8; h.item.state = { found: true }; });
  await page.evaluate(({ v }) => window.__rt.stand(v.x + 5, v.z + 6, 0, -0.7), { v });
  await page.evaluate(() => window.__rt.drop());
  await frames(40);
  await page.evaluate(() => window.__rt.hold('tool:sponge', { life: 0.2 }));
  const bk = (await H('nd-water', 'vessels')).find((x) => x.item === 'nd_bucket' && x.litres > 7);
  const m = await H('nd-water', 'mouth', bk.uid);
  console.log('aim bucket', await page.evaluate(({ m }) => window.__rt.aimPoint(m.x, m.y - 0.1, m.z, 0.8, 1.0), { m }));
  await page.evaluate(() => { const g = window.__rt.game; g.player.press(); for (let i = 0; i < 180; i++) { g.player.primary = true; g.step(1 / 60, 1); } });
  await shot('34_sponge_rinsing.png', JSON.stringify(await page.evaluate(() => window.__rt.game.player.held?.tool?.life)));
  await page.evaluate(() => { const g = window.__rt.game; for (let i = 0; i < 360; i++) { g.player.primary = true; g.step(1 / 60, 1); } g.player.release(); g.simulate(0); });
  console.log('sponge', await page.evaluate(() => window.__rt.game.player.held?.tool?.life), 'bucket', JSON.stringify((await H('nd-water', 'vessels')).find((x) => x.uid === bk.uid)));
  // the pickup's paint faded (its condition 15 %), and polished (the fading taken off), from a few steps off
  await page.evaluate(() => { const p = window.__rt.game.player; p.slots[p.sel] = null; });
  for (const [polish, name] of [[0, '35_paint_faded.png'], [1, '36_paint_polished.png']]) {
    await page.evaluate((polish) => { const v = window.__rt.game.vehicles[0]; v.build.cond = 0.15; v.build.polish = polish; for (const k of Object.keys(v.build.parts)) { v.build.parts[k].cond = 0.15; v.build.parts[k].polish = polish; } v.changed(); }, polish);
    await page.evaluate(({ v }) => window.__rt.aimPoint(v.x, 0.9 + window.__rt.game.world.heightAt(v.x, v.z), v.z, 0.9, 5.5), { v });
    await step(6);
    await shot(name);
  }
  if (errors.length) console.log('errors:', errors.slice(0, 8).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
