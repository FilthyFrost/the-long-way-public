// The workshop (src/game/modcar/workshop.ts; src/core/modcar/workshop.ts, crafting.ts; docs/MODCAR.md §14): a new
// game starts with the power off (the lamps dark, the recycler refusing); the generator outside is pulled into
// life with its rope (never more than three pulls) and the workshop has power, its lamps on — and the box put
// down into the hopper while it had none goes in by itself; four more boxes of old components go into the
// recycler (E), 100 scrap counted in; the bench (E) makes the plastic scraper from 70 of it in three blows of the
// hammer and it lies on the bench, picked up; diesel poured into the
// generator's tank from a jerrycan (its cap off first, empty-handed); the generator stopped at its switch; saved
// and read back: the materials, the generator's fuel and its state.
//   SHOTS_GPU=1 node harness/shots/modcar_workshop.mjs
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
  const ws = () => rt('workshop');
  const shot = async (name) => {
    await page.evaluate(() => window.__rt.render());
    await page.screenshot({ path: `loop/shots/modcar_workshop_${name}.png` });
  };
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 13);
  await rt('simulate', 1);

  // 1. no power: the lamps dark, the recycler keeps what is held up to it
  const w0 = await ws();
  console.log('start', JSON.stringify({ power: w0.power, gen: w0.gen, lit: w0.garage?.lit, stock: w0.stock }));
  if (w0.power || w0.gen.on) fail('a new game has the power on');
  if (!(w0.garage?.lit < 0.05)) fail(`the lamps are lit without power (${w0.garage?.lit})`);
  if (!(w0.gen.litres > 2.5)) fail(`the generator has no diesel to start with (${w0.gen.litres})`);
  await rt('hold', 'item:crate_parts');
  await rt('aimAt', 'recycler', Math.PI, 0.95);
  await rt('press');
  await rt('simulate', 3);
  const refused = { held: (await rt('telemetry')).held, stock: (await ws()).stock.scrap };
  if (refused.held !== 'item:crate_parts' || refused.stock !== 0) fail(`the recycler worked without power ${JSON.stringify(refused)}`);
  // (put down into the hopper: it waits there for the power)
  await rt('drop');
  await rt('simulate', 1);
  const waiting = (await ws()).inHopper;
  if (waiting !== 1) fail(`the box is not lying in the hopper (${waiting})`);

  // 2. the generator: its rope from the yard side, pulled until it runs
  const cord = await rt('aimAt', 'gen_cord', 0, 1.0);
  if (cord !== 'device:gen_cord') fail(`not aimed at the rope (${cord})`);
  let pulls = 0;
  while (!(await ws()).power && pulls < 5) {
    await rt('holdFor', 0.7);
    await rt('simulate', 0.3);
    pulls++;
  }
  await rt('simulate', 2);
  const w1 = await ws();
  await shot('generator');
  console.log('pulled', JSON.stringify({ pulls, power: w1.power, lit: w1.garage?.lit }));
  if (!w1.power || pulls > 3) fail(`${pulls} pulls and the power is ${w1.power ? 'on' : 'off'}`);
  if (!(w1.garage?.lit > 0.9)) fail(`the lamps did not come on with the power (${w1.garage?.lit})`);

  // 3. four boxes of old components into the recycler: 20 scrap each (and the one waiting in the hopper)
  for (let i = 0; i < 4; i++) {
    await rt('hold', 'item:crate_parts');
    const t = await rt('aimAt', 'recycler', Math.PI, 0.95);
    if (i === 0 && t !== 'device:recycler') fail(`not aimed at the recycler (${t})`);
    await rt('press');
    await rt('simulate', 0.5);
    if (i === 0) await shot('recycling');
  }
  await rt('simulate', 3);
  const w2 = await ws();
  console.log('recycled', JSON.stringify(w2.stock));
  if (w2.stock.scrap !== 100) fail(`five boxes gave ${w2.stock.scrap} scrap (not 100)`);

  // 4. the bench: the plastic scraper, three blows
  const bt = await rt('aimAt', 'bench', Math.PI, 1.0);
  if (bt !== 'device:bench') fail(`not aimed at the bench (${bt})`);
  await rt('press');
  await rt('simulate', 0.5);
  const opened = (await ws()).bench;
  await shot('bench');
  if (!opened.open) fail('the bench did not open');
  const made = await rt('craftAll', 'scraper_1');
  await rt('simulate', 0.5);
  const w3 = await ws();
  const lying = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.tool?.kind === 'scraper').map((l) => ({ tier: l.tool.tier, y: l.y })));
  console.log('made', JSON.stringify({ made, stock: w3.stock, lying, bench: w3.bench }));
  if (w3.stock.scrap !== 30) fail(`the scraper took ${100 - w3.stock.scrap} scrap (not 70)`);
  if (lying.length !== 1 || lying[0].tier !== 1 || !(lying[0].y > 0.7)) fail(`the scraper is not on the bench ${JSON.stringify(lying)}`);
  if (w3.bench.open) fail('the bench is still open after the thing was made');
  await rt('simulate', 0.2);
  if (!(await rt('aimLoose', 'tool:scraper', 0.9))) fail('cannot aim at the scraper on the bench');
  await rt('press');
  const held = (await rt('telemetry')).held;
  if (held !== 'tool:scraper') fail(`the scraper did not come into the hands (${held})`);
  await rt('drop');

  // 5. diesel into the generator's tank: the cap off empty-handed, then the can held to it
  const before = (await ws()).gen.litres;
  const f = await rt('genFiller');
  await rt('select', 1);
  const tt = await rt('aimPoint', f.x, f.y, f.z, 0, 0.75);
  if (tt !== 'tank:generator') fail(`not aimed at the generator's tank (${tt})`);
  await rt('press');
  const capOff = (await ws()).gen.cap;
  if (!capOff) fail('the cap did not come off');
  await rt('hold', 'tool:jerrycan', { fuel: 'diesel', litres: 20 });
  await rt('aimPoint', f.x, f.y, f.z, 0, 0.75);
  await rt('useFor', 2.2);
  await rt('simulate', 0.3);
  const after = (await ws()).gen.litres;
  console.log('refuelled', JSON.stringify({ before, after }));
  if (!(after > before + 2.5)) fail(`the tank took ${(after - before).toFixed(2)} L in 2 s`);
  await rt('drop');

  // 6. stopped at its switch
  const st = await rt('aimAt', 'gen_switch', 0, 0.85);
  if (st !== 'device:gen_switch' && st !== 'device:gen_cord') fail(`not aimed at the switch (${st})`);
  await rt('press');
  await rt('simulate', 1.5);
  const w4 = await ws();
  if (w4.power) fail('the generator did not stop');
  if (!(w4.garage?.lit < 0.05)) fail(`the lamps stayed lit (${w4.garage?.lit})`);

  // 7. saved and read back
  await page.evaluate(() => window.__rt.game.save());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await rt('simulate', 0.5);
  const w5 = await ws();
  console.log('read back', JSON.stringify({ stock: w5.stock, gen: w5.gen }));
  if (w5.stock.scrap !== 30) fail(`the materials did not come back (${JSON.stringify(w5.stock)})`);
  if (Math.abs(w5.gen.litres - w4.gen.litres) > 0.05 || w5.gen.on || !w5.gen.cap) fail(`the generator did not come back as it was ${JSON.stringify(w5.gen)}`);

  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
  console.log(bad ? `${bad} failed` : 'workshop ok');
} finally {
  await browser.close();
  await server.close();
}
process.exit(bad ? 1 : 0);
