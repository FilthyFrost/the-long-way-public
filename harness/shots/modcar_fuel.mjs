// Refuelling the way Arctic Drive does it, in the live game loop (not the harness's stepping): taking a part
// off with F held leaves the game running; the filler flap opens and shuts with E, empty-handed; a jerrycan
// held to the shut flap pours nothing (the words say to open it by hand); held to the open flap it goes to
// it by itself and lines up, E held pours — one stands still and the view holds while it flows, the liquid
// shows going in, the strip says from what into what, the cards' bars move — the other button draws it
// back out; held anywhere else on the body nothing goes in and the words say where the filler is; the
// pickup, the motorcycle (the cap on its tank, opened by hand too) and the motorhome fill the same way;
// water goes into the radiator at its blue cap, oil into the engine at its yellow one.
// Writes loop/shots/modcar_fuel/*.png.
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
  // (the key card waits for a click that never comes here)
  await page.evaluate(() => window.__rt.game.ui.showHelp(false));
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
  const tele = () => page.evaluate(() => window.__rt.game.player.telemetry());
  const litres = (f) => Object.values(f?.fuel ?? {}).reduce((a, b) => a + b, 0);
  const canL = () => page.evaluate(() => window.__rt.game.player.held?.tool?.litres ?? -1);
  const hud = () =>
    page.evaluate(() => {
      const shown = (sel) => {
        const e = document.querySelector(sel);
        return !!e && e.style.display !== 'none' && e.style.opacity !== '0';
      };
      return { acts: document.querySelector('.mc-acts')?.textContent ?? '', xfer: shown('.mc-xfer') ? document.querySelector('.mc-xfer').textContent : '', done: shown('.mc-done') ? document.querySelector('.mc-done').textContent : '', aim: shown('.mc-ic.aim') ? document.querySelector('.mc-ic.aim .nm').textContent : '', held: shown('.mc-ic.held') ? document.querySelector('.mc-ic.held .nm').textContent : '' };
    });
  const docked = () => page.evaluate(() => ({ docked: window.__rt.game.heldThing.docked, pouring: window.__rt.game.heldThing.pouring }));
  const waitFor = async (fn, ms, what) => {
    const t0 = Date.now();
    for (;;) {
      if (await fn()) return true;
      if (Date.now() - t0 > ms) {
        fail(what);
        return false;
      }
      await page.waitForTimeout(80);
    }
  };

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
  await waitFor(async () => (await rt('filler', 0)).amount > 0.85, 3000, 'E did not open the flap');
  await rt('setOrbit', 115, 12, 2.6, 0.6, 0);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(out, 'flap_open.png') });
  await rt('aimCap', 0);
  await page.keyboard.press('KeyE');
  await waitFor(async () => (await rt('filler', 0)).amount < 0.15, 3000, 'E did not shut the flap');
  await running('the flap');

  // ---- the jerrycan at the shut flap: nothing goes in, the words say to open it by hand
  await rt('pickUp', 'tool:jerrycan');
  await rt('aimCap', 0);
  t = await tele();
  if (!String(t.target).startsWith('filler:')) fail(`with the can at the shut flap, the mark is on ${t.target}`);
  const shut0 = litres(await rt('filler', 0));
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyE');
  if (litres(await rt('filler', 0)) - shut0 > 0.01) fail('fuel went in through the shut flap');
  if ((await rt('filler', 0)).open) fail('the can opened the flap (it is opened by hand)');
  if (!/空手按 E 打开/.test((await hud()).acts)) fail(`no word on opening the flap by hand: ${(await hud()).acts}`);
  await page.screenshot({ path: path.join(out, 'can_flap_shut.png') });

  // ---- the other slot (empty hands), E on the flap, the can again: it goes to the filler by itself
  await page.keyboard.press('Digit2');
  await waitFor(async () => (await tele()).held === '', 2000, '2 did not empty the hands');
  await rt('aimCap', 0);
  await page.keyboard.press('KeyE');
  await waitFor(async () => (await rt('filler', 0)).open, 2000, 'the flap did not open by hand');
  await page.keyboard.press('Digit1');
  await waitFor(async () => (await tele()).held === 'tool:jerrycan', 2000, '1 did not bring the can back');
  await rt('aimCap', 0);
  await waitFor(async () => (await docked()).docked > 0.9, 3000, 'the can did not go to the open filler');
  await page.screenshot({ path: path.join(out, 'can_docked.png') });
  const h0 = await hud();
  if (!/油箱/.test(h0.aim)) fail(`at the filler the card beside the mark is not the tank's (${h0.aim})`);
  if (!/油桶/.test(h0.held)) fail(`the can's card is not on the right (${h0.held})`);

  // ---- E held: fuel goes in; one stands still (W held too), the view holds; the liquid, the strip
  const before = litres(await rt('filler', 0));
  const can0 = await canL();
  const foot0 = await tele();
  await page.keyboard.down('KeyE');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1600);
  const look0 = await page.evaluate(() => window.__rt.game.input.lookYaw);
  await page.evaluate(() => window.__rt.game.input.turn(300, 0));
  const look1 = await page.evaluate(() => window.__rt.game.input.lookYaw);
  const pouringHud = await hud();
  const streamOn = await page.evaluate(() => window.__rt.game.core.scene.getObjectByName('modcar:stream')?.visible);
  const pd = await docked();
  await rt('setView', 'cockpit');
  await page.screenshot({ path: path.join(out, 'pouring.png') });
  const pouring = await rt('filler', 0);
  const foot1 = await tele();
  await page.keyboard.up('KeyW');
  await page.keyboard.up('KeyE');
  console.log('pouring', JSON.stringify({ tank: litres(pouring) - before, can: can0 - (await canL()), moved: Math.hypot(foot1.footX - foot0.footX, foot1.footZ - foot0.footZ), turned: look1 - look0, stream: streamOn, tipped: pd.pouring, strip: pouringHud.xfer }));
  if (litres(pouring) - before < 2) fail(`only ${(litres(pouring) - before).toFixed(2)} L went in`);
  if (Math.hypot(foot1.footX - foot0.footX, foot1.footZ - foot0.footZ) > 0.02) fail('one walked off while pouring');
  if (Math.abs(look1 - look0) > 1e-6) fail('the view turned while pouring');
  if (!streamOn) fail('no liquid seen going in');
  if (pd.pouring < 0.7) fail(`the can did not tip over (${pd.pouring.toFixed(2)})`);
  if (!/油桶/.test(pouringHud.xfer) || !/油箱/.test(pouringHud.xfer)) fail(`the strip does not say from what into what: ${pouringHud.xfer}`);
  const boot = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('trunk'));
  if (boot > 0.05) fail('the boot opened');
  await waitFor(async () => /加进去/.test((await hud()).done), 2000, 'no word on how much went in');
  // the tutorial's step is done
  const steps = await page.evaluate(() => window.__rt.telemetry().steps);
  if (!steps.includes('fuel')) fail(`the checklist's fuel step is not done (${steps})`);

  // ---- the right button (F) held: it comes back out into the can
  const tank1 = litres(await rt('filler', 0));
  const can1 = await canL();
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(1200);
  const siphonHud = await hud();
  await page.keyboard.up('KeyF');
  const tank2 = litres(await rt('filler', 0));
  const can2 = await canL();
  console.log('drawn out', JSON.stringify({ tank: tank1 - tank2, can: can2 - can1, strip: siphonHud.xfer }));
  if (tank1 - tank2 < 0.5 || can2 - can1 < 0.5) fail(`nothing came back out (${(tank1 - tank2).toFixed(2)} L)`);
  if (Math.abs(tank1 - tank2 - (can2 - can1)) > 0.05) fail('what left the tank is not what went into the can');
  if (!/油箱[\s\S]*油桶/.test(siphonHud.xfer)) fail(`the strip does not say tank → can: ${siphonHud.xfer}`);

  // ---- held at the boot instead: nothing goes in, the words say where the filler is
  await rt('aim', 0, 'trunk', 1.4);
  const atBoot = litres(await rt('filler', 0));
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1000);
  await page.keyboard.up('KeyE');
  if (litres(await rt('filler', 0)) - atBoot > 0.01) fail('fuel went in through the boot');
  if (!/加油口在/.test((await hud()).acts)) fail(`no word on where the filler is: ${(await hud()).acts}`);

  // ---- the others: the pickup (a diesel can), the motorcycle (its tank cap by hand), the motorhome
  for (const [vi, fuel] of [
    [1, 'diesel'],
    [2, 'petrol'],
    [3, 'diesel'],
  ]) {
    // (the flap or the cap opened empty-handed first)
    await page.evaluate(() => (window.__rt.game.player.held = null));
    if (!(await rt('aimCap', vi))) {
      fail(`vehicle ${vi}: no filler`);
      continue;
    }
    await page.keyboard.press('KeyE');
    await waitFor(async () => (await rt('filler', vi)).open, 2000, `vehicle ${vi}: E did not open its filler`);
    await rt('hold', 'tool:jerrycan', { fuel, litres: 20 });
    await rt('aimCap', vi);
    const tt = await tele();
    const b0 = litres(await rt('filler', vi));
    await page.keyboard.down('KeyE');
    await page.waitForTimeout(1500);
    await page.keyboard.up('KeyE');
    const b1 = litres(await rt('filler', vi));
    const frame = await page.evaluate((vi) => window.__rt.game.vehicles[vi].build.frame, vi);
    console.log(frame, tt.target, `+${(b1 - b0).toFixed(2)} L`);
    if (b1 - b0 < 1) fail(`${frame}: only ${(b1 - b0).toFixed(2)} L went in`);
    if (frame === 'moto') {
      await page.screenshot({ path: path.join(out, 'moto.png') });
    }
  }

  // ---- water at the radiator's blue cap (the bonnet open): some drawn out first to make room, then poured back
  await rt('openPanel', 0, 'hood', true);
  await rt('hold', 'tool:bottle', { litres: 1 });
  if (!(await rt('aimFiller', 0, 'water', 0.85))) fail('no water filler on the sedan');
  t = await tele();
  if (!String(t.target).startsWith('filler:')) fail(`the bottle at the radiator: the mark is on ${t.target}`);
  const water = () => page.evaluate(() => window.__rt.game.vehicles[0].build.parts.radiator?.fluids.coolantL ?? 0);
  const w0 = await water();
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyF');
  const w1 = await water();
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'water.png') });
  await page.keyboard.up('KeyE');
  const w2 = await water();
  console.log('water', JSON.stringify({ w0, w1, w2 }));
  if (w0 - w1 < 0.5) fail('no water came out of the radiator');
  if (w2 - w1 < 0.5) fail('no water went into the radiator');

  // ---- oil at the pickup's yellow cap
  await rt('openPanel', 1, 'hood', true);
  await rt('hold', 'tool:oilcan', { litres: 1 });
  if (!(await rt('aimFiller', 1, 'oil', 0.85))) fail('no oil filler on the pickup');
  t = await tele();
  if (!String(t.target).startsWith('filler:')) fail(`the oil can at the engine: the mark is on ${t.target}`);
  const oil = () => page.evaluate(() => window.__rt.game.vehicles[1].build.parts.engine?.fluids.oilL ?? 0);
  const o0 = await oil();
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyF');
  const o1 = await oil();
  await page.keyboard.down('KeyE');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'oil.png') });
  await page.keyboard.up('KeyE');
  const o2 = await oil();
  console.log('oil', JSON.stringify({ o0, o1, o2 }));
  if (o0 - o1 < 0.3) fail('no oil came out of the engine');
  if (o2 - o1 < 0.3) fail('no oil went into the engine');

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
