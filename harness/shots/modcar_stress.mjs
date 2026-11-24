// Everything off and on again: on every vehicle of the garage, every part is taken off with the button held
// (its lid opened first when one covers it), put down, picked up, held to its ghost and fitted back; every
// panel opened and shut; every tool used on it — and nothing may throw (a throw used to freeze the game). Then
// the same in the live loop for the engine, the fuel tank and a wheel. Writes nothing.
//   SHOTS_GPU=1 node harness/shots/modcar_stress.mjs
import { holdKeyUntil, launchBrowser, ON_GPU, openGame, startServer, waitFrames } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&project=full`, { width: 1280, height: 720 });
  const rt = async (name, ...args) => {
    try {
      return await page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
    } catch (e) {
      fail(`${name}(${args.map((a) => JSON.stringify(a)).join(', ')}) threw: ${e.message.split('\n')[0]}`);
      return null;
    }
  };
  const vehicles = await page.evaluate(() => window.__rt.game.vehicles.map((v, i) => ({ i, frame: v.build.frame, mounts: Object.keys(v.build.parts) })));
  for (const v of vehicles) {
    let off = 0;
    let back = 0;
    for (const mount of v.mounts) {
      // the lid over it open (a bonnet over the engine, a boot over the tank)
      const lid = await page.evaluate(({ i, mount }) => window.__rt.game.vehicles[i].view.shutOver(mount), { i: v.i, mount });
      if (lid) await rt('openPanel', v.i, lid, true);
      await page.evaluate(() => (window.__rt.game.player.held = null));
      if (!(await rt('aim', v.i, mount, 1.3))) continue;
      const t = await rt('telemetry');
      if (t?.target !== `part:${await page.evaluate((i) => window.__rt.game.vehicles[i].build.uid, v.i)}:${mount}`) continue;
      // taken off with the button held
      const before = await page.evaluate(({ i, mount }) => window.__rt.game.vehicles[i].build.parts[mount]?.part, { i: v.i, mount });
      await rt('takeFor', 3.2);
      const held = (await rt('telemetry'))?.held;
      if (held !== before) continue;
      off++;
      // put down, picked up again, held to its ghost, fitted
      await page.evaluate(() => window.__rt.game.player.putDown());
      await page.evaluate(() => window.__rt.game.simulate(1.2));
      await page.evaluate(() => {
        const g = window.__rt.game;
        const l = g.loose.list.at(-1);
        if (l) {
          g.loose.remove(l);
          g.player.held = l.part ? { kind: 'part', inst: l.part } : { kind: 'tool', tool: l.tool };
        }
      });
      await rt('aim', v.i, mount, 1.3);
      await rt('useFor', 3.2);
      const now = await page.evaluate(({ i, mount }) => window.__rt.game.vehicles[i].build.parts[mount]?.part, { i: v.i, mount });
      if (now === before) back++;
      else {
        // (some go back only from where the ghost is easy to reach: fitted straight on, so the next ones have their places)
        await rt('fit', v.i, mount, before);
        await page.evaluate(() => (window.__rt.game.player.held = null));
      }
    }
    console.log(`${v.frame}: ${v.mounts.length} parts, ${off} taken off, ${back} fitted back by hand`);
    if (off < Math.min(5, v.mounts.length)) fail(`${v.frame}: only ${off} parts came off`);
    // every panel open and shut with E
    const panels = await page.evaluate((i) => {
      const v = window.__rt.game.vehicles[i];
      return v.view.frame.mounts.filter((m) => v.view.hasPanel(m.id) && v.build.parts[m.id]).map((m) => m.id);
    }, v.i);
    for (const p of panels) {
      await rt('aim', v.i, p, 1.4);
      await rt('press');
      await page.evaluate(() => window.__rt.game.simulate(0.8));
      await rt('aim', v.i, p, 1.4);
      await rt('press');
      await page.evaluate(() => window.__rt.game.simulate(0.8));
    }
    // every tool on it
    for (const [tool, opts] of [
      ['tool:jerrycan', { fuel: v.frame === 'rv' || v.frame === 'pickup' ? 'diesel' : 'petrol', litres: 20 }],
      ['tool:bottle', {}],
      ['tool:oilcan', {}],
      ['tool:spray', { colour: 4 }],
      ['tool:scraper', { tier: 1 }],
    ]) {
      await rt('hold', tool, opts);
      if (tool === 'tool:jerrycan') await rt('aimCap', v.i);
      else await rt('aim', v.i, tool === 'tool:spray' || tool === 'tool:scraper' ? (v.mounts.includes('door_FL') ? 'door_FL' : v.mounts[0]) : v.mounts.includes('engine') ? 'engine' : v.mounts[0], 1.4);
      await rt('useFor', 1.5);
    }
    await page.evaluate(() => (window.__rt.game.player.held = null));
    // in and out, the engine started and stopped
    if (await rt('enter', v.i)) {
      await rt('crank', 2);
      await rt('exit');
    }
    const lastError = await page.evaluate(() => window.__rt.lastError);
    if (lastError) fail(`${v.frame}: a frame threw ${lastError}`);
  }
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await page.close();

  // ---- the live loop: the engine, the tank and a wheel off with the left button held (docs/V3/plan/growth.md J1), the game going on
  const live = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const liveErrors = [];
  live.on('pageerror', (e) => liveErrors.push(e.message));
  await live.goto(`${url}/modcar.html?project=full&new=1`);
  await live.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  await live.evaluate(() => {
    const g = window.__rt.game;
    window.__gameFrames = 0;
    const f = g.frame.bind(g);
    g.frame = (dt) => {
      window.__gameFrames++;
      f(dt);
    };
  });
  const lrt = (name, ...args) => live.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  for (const [vi, mount] of [
    [0, 'engine'],
    [0, 'fuelTank'],
    [0, 'hub_FL'],
    [1, 'engine'],
    [3, 'battery'],
  ]) {
    const lid = await live.evaluate(({ vi, mount }) => window.__rt.game.vehicles[vi].view.shutOver(mount), { vi, mount });
    if (lid) await lrt('openPanel', vi, lid, true);
    await live.evaluate(() => (window.__rt.game.player.held = null));
    await lrt('aim', vi, mount, 1.3);
    // the left button held 3.4 s of game time, the part in the hands at the end of it; then the loop must still be
    // turning: five more frames, however long they take to draw, within the bound
    await lrt('takeFor', 3.4);
    const a = await live.evaluate(() => window.__gameFrames);
    const turning = await waitFrames(live, 5, ON_GPU ? 400 : 60_000);
    const b = await live.evaluate(() => window.__gameFrames);
    const held = await live.evaluate(() => window.__rt.telemetry().held);
    console.log(`live: ${mount} of vehicle ${vi} off → in the hands ${held}, ${b - a} frames after`);
    if (!held) fail(`live: ${mount} did not come off with the left button held`);
    if (!turning) fail(`live: the game stopped after taking off ${mount}`);
    await live.evaluate(() => window.__rt.game.player.putDown());
  }
  const le = await live.evaluate(() => window.__rt.lastError);
  if (le) fail(`live: a frame threw ${le}`);
  if (liveErrors.length) fail(`live page errors: ${liveErrors.slice(0, 5).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_stress: ${bad} FAILED` : 'modcar_stress: ok');
process.exit(bad ? 1 : 0);
