// Cleaning (src/game/modcar/grime.ts, src/core/modcar/tools.ts CLEANERS; docs/MODCAR.md §15): a new game's project
// car stands caked in a barn's years of grime, its windows too — nothing to be seen through them from the seat; the
// checklist asks for the windscreen scraped once the scraper is made; the plastic scraper over the windscreen (the
// view held, the mouse moving the blade): a band of clear glass where it went, a smeary film after one pass, clean
// after two — the windscreen comes clean (its unit done) and the step with it; the sponge over a door takes its
// dust but not its crust, the scraper the crust; the scraper wears; H lights up the dirt left; a dusty rim lying on
// the floor sponged; saved and read back, the masks come back with the save (IndexedDB) as they were.
//   SHOTS_GPU=1 node harness/shots/modcar_grime.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const shot = async (name) => {
    await page.evaluate(() => {
      window.__rt.game.ui.showHelp(false);
      window.__rt.render();
    });
    await page.screenshot({ path: `loop/shots/modcar_grime_${name}.png` });
  };
  const unitOf = (g, owner, unit) => g.cleaning.find((c) => c.owner === owner)?.units.find((u) => u.unit === unit) ?? null;
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 13);
  await rt('simulate', 0.5);

  // 1. the project car caked over; the checklist's step after the scraper
  const car = await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    return { crust: v.build.crust ?? 0, dirt: v.build.dirt, door: v.build.parts.door_FL?.crust ?? 0, steps: window.__rt.game.tutorialSteps().map((s) => s.id) };
  });
  console.log('car', JSON.stringify(car));
  if (!(car.crust > 0.5)) fail(`the project car is not caked (crust ${car.crust})`);
  const si = car.steps.indexOf('scraper');
  if (si < 0 || car.steps[si + 1] !== 'windscreen') fail(`no windscreen step after the scraper (${car.steps.join(',')})`);
  await rt('enter', 0);
  await rt('simulate', 0.4);
  await shot('cabin');
  await rt('exit');

  // 2. the plastic scraper over the windscreen: one pass leaves a film, two clean it
  const ws = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const p = v.view.windscreenAt(v.view.root.position.clone());
    const o = g.core.origin;
    const b = new Float64Array(9);
    v.sim.basis(b);
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, fwd: Math.atan2(b[2], b[0]) };
  });
  await rt('hold', 'tool:scraper', { tier: 1 });
  await rt('aimPoint', ws.x, ws.y, ws.z, ws.fwd + 0.2, 1.05);
  const aim = (await rt('grime')).aim;
  if (aim !== '前挡风玻璃') fail(`the mark is not on the windscreen (${aim})`);
  await shot('before');
  // (rows close enough on the slanted glass that the blade's bands meet)
  const once = await rt('scrub', 4.0, 18, 0.62, 0.42);
  const w1 = unitOf(once.grime, 'body', 5);
  console.log('one pass', JSON.stringify(w1));
  if (!once.started) fail('the scrub did not start');
  if (!w1 || !(w1.dirt < 0.75)) fail(`one pass did not take the windscreen's crust down (${JSON.stringify(w1)})`);
  if (w1 && w1.dirt < 0.08) fail(`one pass cleaned the windscreen whole: it should take two (${w1.dirt})`);
  await shot('one_pass');
  const twice = await rt('scrub', 4.0, 18, 0.62, 0.42);
  const w2 = unitOf(twice.grime, 'body', 5);
  console.log('two passes', JSON.stringify(w2));
  await shot('two_passes');
  if (!w2 || !(w2.dirt < 0.35)) fail(`two passes left the windscreen dirty (${JSON.stringify(w2)})`);
  // (and over its corners, as one does once H shows them)
  let last = twice;
  for (const [cx, cy] of [[-0.45, 0.1], [0.45, 0.1], [0, 0.32], [0, -0.25]]) {
    if ((last.grime.cleaning.find((c) => c.owner === 'body')?.doneDirt ?? []).includes(5)) break;
    last = await rt('scrub', 1.6, 8, 0.3, 0.16, cx, cy);
  }
  const doneWs = last.grime.cleaning.find((c) => c.owner === 'body')?.doneDirt ?? [];
  console.log('the corners', JSON.stringify(unitOf(last.grime, 'body', 5)), 'done', JSON.stringify(doneWs));
  if (!doneWs.includes(5)) fail(`the windscreen did not come clean (${JSON.stringify(w2)})`);
  await shot('clean');
  const steps = await page.evaluate(() => window.__rt.game.tutorialSteps().filter((s) => s.done).map((s) => s.id));
  if (!steps.includes('windscreen')) fail(`the checklist's windscreen step is not done (${steps.join(',')})`);
  const life = await page.evaluate(() => window.__rt.game.player.held?.tool?.life ?? 1);
  if (!(life < 1)) fail(`the scraper did not wear (${life})`);

  // 3. the front left door: the sponge takes its dust, not its crust; the scraper the crust
  await rt('hold', 'tool:sponge', {});
  await rt('aim', 0, 'door_FL', 0.95);
  const sp = unitOf((await rt('scrub', 2.6, 8, 0.42, 0.36)).grime, 'p:door_FL', 0);
  console.log('sponge on the door', JSON.stringify(sp));
  if (!sp || !(sp.dirt > 0.5)) fail(`the sponge took the door's crust (${JSON.stringify(sp)})`);
  await rt('hold', 'tool:scraper', { tier: 2 });
  await rt('aim', 0, 'door_FL', 0.95);
  const sc = unitOf((await rt('scrub', 2.6, 8, 0.42, 0.36)).grime, 'p:door_FL', 0);
  console.log('scraper on the door', JSON.stringify(sc));
  if (!sc || !(sc.dirt < sp.dirt - 0.3)) fail(`the scraper did not take the door's crust (${JSON.stringify(sc)})`);
  await shot('door');

  // 4. H: the dirt still left lit up
  await page.keyboard.press('KeyH');
  await rt('simulate', 0.5);
  const showing = await page.evaluate(() => window.__rt.game.grimeShowT);
  if (!(showing > 0)) fail('H did not light up the dirt');
  await shot('highlight');
  await rt('simulate', 2.5);

  // 5. a dusty rim lying about, sponged
  const rim = await page.evaluate(() => {
    const l = window.__rt.game.loose.list.find((x) => x.part && x.part.part.startsWith('rim_') && !x.riding);
    return l ? { x: l.x, y: l.y + l.mid, z: l.z, uid: l.part.uid } : null;
  });
  if (!rim) fail('no rim lying about');
  else {
    await rt('hold', 'tool:sponge', {});
    await rt('aimPoint', rim.x, rim.y, rim.z, 0.4, 0.75);
    const r = await rt('scrub', 2.4, 8, 0.4, 0.35);
    const c = r.grime.cleaning.find((x) => x.key === rim.uid);
    console.log('rim', JSON.stringify(c?.units ?? null));
    if (!c || !(c.units[0]?.dirt < 0.9)) fail(`the rim lying about was not cleaned (${JSON.stringify(c)})`);
  }

  // 6. saved and read back: the masks as they were
  const before = (await rt('grime')).cleaning.map((c) => ({ key: c.key, units: c.units.map((u) => +u.dirt.toFixed(2)) }));
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(1500);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await rt('simulate', 0.6);
  const after = (await rt('grime')).cleaning.map((c) => ({ key: c.key, units: c.units.map((u) => +u.dirt.toFixed(2)) }));
  console.log('read back', JSON.stringify({ before, after }));
  for (const b of before) {
    const a = after.find((x) => x.key === b.key);
    if (!a) {
      fail(`the mask of ${b.key} did not come back`);
      continue;
    }
    if (a.units.length && b.units.length && Math.abs(a.units[0] - b.units[0]) > 0.06) fail(`the mask of ${b.key} came back changed (${b.units[0]} → ${a.units[0]})`);
  }
  const doneBack = (await rt('grime')).cleaning.find((c) => c.owner === 'body')?.doneDirt ?? [];
  if (!doneBack.includes(5)) fail('the windscreen read back is not done');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  // (the next probe starts a new game)
  await page.evaluate(() => {
    try {
      localStorage.removeItem('modcar.save.v1');
    } catch {
      /* none */
    }
  });
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_grime: ${bad} FAILED` : 'grime ok');
process.exit(bad ? 1 : 0);
