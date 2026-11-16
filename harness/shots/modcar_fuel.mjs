// Refuelling at the filler, and taking a part off, in the live game loop (not the harness's stepping):
// taking a part off with F held leaves the game running (it used to throw and stop the loop for good); the
// filler flap opens and shuts with E; a jerrycan held to it opens it and pours, the boot staying shut; held
// anywhere else on the body it pours nothing and says where the filler is; the pickup, the motorcycle (the cap
// on its tank) and the motorhome (diesel) fill the same way. Writes loop/shots/modcar_fuel/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_fuel.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_fuel');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`no answer: ${what}`)), ms))]);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto(`${url}/modcar.html?new=1`);
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  // count the game's own frames
  await page.evaluate(() => {
    const g = window.__rt.game;
    window.__gameFrames = 0;
    const f = g.frame.bind(g);
    g.frame = (dt) => {
      window.__gameFrames++;
      f(dt);
    };
  });
  const rt = (name, ...args) => within(page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args }), 20_000, name);
  const running = async (what) => {
    const a = await within(page.evaluate(() => window.__gameFrames), 8000, what);
    await page.waitForTimeout(400);
    const b = await within(page.evaluate(() => window.__gameFrames), 8000, what);
    if (b - a < 5) fail(`${what}: the game stopped (${b - a} frames in 0.4 s)`);
  };
  const tele = () => rt('telemetry');
  const litres = (f) => Object.values(f?.fuel ?? {}).reduce((a, b) => a + b, 0);

  // ---- a part off with F held: the game goes on, the part is in the hands
  await rt('aim', 1, 'door_FL', 1.3);
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyF');
  await running('after taking the door off');
  const off = await tele();
  if (off.held !== 'door_stock') fail(`the door is not in the hands (${off.held})`);
  await page.evaluate(() => window.__rt.game.player.putDown());

  // ---- the sedan's flap, by hand
  if (!(await rt('aimCap', 0))) fail('no filler on the sedan');
  let t = await tele();
  if (t.target !== `cap:${await page.evaluate(() => window.__rt.game.vehicles[0].build.uid)}`) fail(`aimed at the flap, the mark is on ${t.target}`);
  await page.keyboard.press('KeyE');
  // (it swings open over a few frames)
  let f = await rt('filler', 0);
  for (let i = 0; i < 30 && f.amount < 0.85; i++) {
    await page.waitForTimeout(100);
    f = await rt('filler', 0);
  }
  console.log('flap opened by hand', JSON.stringify(f));
  if (!f.open || f.amount < 0.85) fail('E did not open the flap');
  await rt('setOrbit', 115, 12, 2.6, 0.6, 0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'flap_open.png') });
  await rt('aimCap', 0);
  await page.keyboard.press('KeyE');
  f = await rt('filler', 0);
  for (let i = 0; i < 30 && f.amount > 0.15; i++) {
    await page.waitForTimeout(100);
    f = await rt('filler', 0);
  }
  if (f.open || f.amount > 0.15) fail('E did not shut the flap');
  await running('the flap');

  // ---- the jerrycan held to it: the flap opens, fuel goes in, the boot stays shut
  await rt('pickUp', 'tool:jerrycan');
  await rt('aimCap', 0);
  t = await tele();
  if (!String(t.target).startsWith('pour:')) fail(`with the can at the flap, the mark is on ${t.target}`);
  const before = litres(await rt('filler', 0));
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(2500);
  const pouring = await rt('filler', 0);
  await page.keyboard.up('KeyE');
  console.log('pouring', JSON.stringify(pouring));
  if (litres(pouring) - before < 2) fail(`only ${(litres(pouring) - before).toFixed(2)} L went in`);
  if (!pouring.open) fail('the flap did not open for the can');
  const boot = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('trunk'));
  if (boot > 0.05) fail('the boot opened');
  await rt('setOrbit', 120, 10, 2.8, 0.6, 0);
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(out, 'filled.png') });
  await rt('setView', 'cockpit');
  await running('pouring');
  // the tutorial's step is done
  const steps = await page.evaluate(() => window.__rt.telemetry().steps);
  if (!steps.includes('fuel')) fail(`the checklist's fuel step is not done (${steps})`);

  // ---- held at the boot instead: nothing goes in, the words say where the filler is
  await rt('aim', 0, 'trunk', 1.4);
  const word = await page.evaluate(() => document.querySelector('.mc-prompt')?.textContent ?? document.body.innerText.match(/加油口在[^\\n]*/)?.[0] ?? '');
  const atBoot = litres(await rt('filler', 0));
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyE');
  const after = litres(await rt('filler', 0));
  console.log('at the boot', JSON.stringify({ word, poured: after - atBoot }));
  if (after - atBoot > 0.01) fail('fuel went in through the boot');
  if (!/加油口在/.test(await page.evaluate(() => document.body.innerText))) fail('no word on where the filler is');

  // ---- the others: the pickup (petrol can into its diesel? no: a diesel can), the motorcycle's tank, the motorhome
  for (const [vi, fuel] of [
    [1, 'diesel'],
    [2, 'petrol'],
    [3, 'diesel'],
  ]) {
    await rt('hold', 'tool:jerrycan', { fuel, litres: 20 });
    if (!(await rt('aimCap', vi))) {
      fail(`vehicle ${vi}: no filler`);
      continue;
    }
    const tt = await tele();
    const b0 = litres(await rt('filler', vi));
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyE');
    const b1 = litres(await rt('filler', vi));
    const frame = await page.evaluate((vi) => window.__rt.game.vehicles[vi].build.frame, vi);
    console.log(frame, tt.target, `+${(b1 - b0).toFixed(2)} L`);
    if (b1 - b0 < 1) fail(`${frame}: only ${(b1 - b0).toFixed(2)} L went in`);
  }
  await running('the end');
  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_fuel: ${bad} FAILED` : 'modcar_fuel: ok');
process.exit(bad ? 1 : 0);
