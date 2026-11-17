// Things stowed in vehicles and the backpack (src/game/modcar/cargo.ts, cargoList.ts; docs/MODCAR.md §5.6):
// a box of components aimed into the donor pickup's bed and put in with E; a jerrycan packed into the sedan
// with G held looking at it (the boot opens for it, the can lies down if it is too tall to stand); the load
// weighs on the vehicles; a backpack put on with F held (more hotbar slots); saved and read back (all where
// they were); the can taken out from Tab's list, the box with E; the backpack taken off from Tab's list.
//   SHOTS_GPU=1 node harness/shots/modcar_stow.mjs
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
  const settle = (s = 0.4) => page.waitForTimeout(s * 1000);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const frames = await page.evaluate(() => window.__rt.game.vehicles.map((v) => v.view.frame.id));
  const sd = frames.indexOf('sedan');
  const pk = frames.indexOf('pickup');
  const mass0 = { sedan: (await rt('stowed', sd)).mass, pickup: (await rt('stowed', pk)).mass };

  // the floors as drawn from above: the boot's at 0.36, the bed's at 0.69 with its wheel arches higher
  const trunk = await rt('floorOf', sd, 'trunk');
  const bed = await rt('floorOf', pk, 'bed');
  console.log('floors', JSON.stringify({ trunk: [trunk.floor, trunk.lo, trunk.hi], bed: [bed.floor, bed.lo, bed.hi] }));
  if (trunk.floor < 0.9 || Math.abs(trunk.lo - 0.31) > 0.08) fail(`the boot's floor reads wrong ${JSON.stringify(trunk)}`);
  if (bed.floor < 0.9 || Math.abs(bed.lo - 0.6) > 0.08 || bed.hi < 0.9) fail(`the bed's floor reads wrong ${JSON.stringify(bed)}`);

  // 1. a box of components into the bed, aimed, with E
  await rt('hold', 'item:crate_parts');
  await settle();
  await rt('aimZone', pk, 'bed', 1.2);
  const aimBed = await rt('telemetry');
  if (!String(aimBed.target).startsWith('stow:') || !aimBed.target.endsWith(':bed')) fail(`not aimed into the bed (${aimBed.target})`);
  await rt('press');
  const inBed = await rt('stowed', pk);
  if (!inBed.things.some((t) => t.what === 'item:crate_parts' && t.zone === 'bed')) fail(`the box is not in the bed ${JSON.stringify(inBed)}`);
  if (!(inBed.mass > mass0.pickup + 1.5)) fail(`the pickup does not weigh the box (${mass0.pickup} → ${inBed.mass})`);

  // 2. the petrol can into the sedan without aiming: G held looking at the shut boot
  await rt('pickUp', 'tool:jerrycan');
  await settle();
  await rt('aim', sd, 'trunk', 1.6);
  const looked = await rt('telemetry');
  await rt('dropFor', 0.6);
  const inCar = await rt('stowed', sd);
  const lid = await page.evaluate((i) => window.__rt.game.vehicles[i].view.panelOpen('trunk'), sd);
  console.log('packed in', JSON.stringify({ looked: looked.target, inCar, lid }));
  if (!inCar.things.some((t) => t.what === 'tool:jerrycan' && t.zone === 'trunk')) fail(`the can did not go into the boot ${JSON.stringify(inCar)}`);
  if (!(lid > 0)) fail('the boot did not open for the can');
  if (!(inCar.load > 15)) fail(`the sedan's load is ${inCar.load} kg`);

  // 3. a backpack on: three more slots
  await rt('hold', 'item:pack_std');
  await rt('takeFor', 0.7);
  const packed = await page.evaluate(() => ({ slots: window.__rt.game.player.slots.length, pack: window.__rt.game.player.pack?.item ?? null, held: window.__rt.telemetry().held }));
  if (packed.slots !== 5 || packed.pack !== 'pack_std' || packed.held) fail(`the backpack is not on ${JSON.stringify(packed)}`);

  // 4. saved and read back
  await page.evaluate(() => window.__rt.game.save());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  await settle(1);
  const back = { bed: await rt('stowed', pk), car: await rt('stowed', sd), slots: await page.evaluate(() => window.__rt.game.player.slots.length), pack: await page.evaluate(() => window.__rt.game.player.pack?.item ?? null) };
  console.log('read back', JSON.stringify(back));
  if (!back.bed.things.some((t) => t.what === 'item:crate_parts' && t.zone === 'bed')) fail('the box is not in the bed after the reload');
  if (!back.car.things.some((t) => t.what === 'tool:jerrycan' && t.zone === 'trunk')) fail('the can is not in the boot after the reload');
  if (!(back.car.load > 15)) fail(`the sedan's load was not weighed again (${back.car.load})`);
  if (back.slots !== 5 || back.pack !== 'pack_std') fail('the backpack did not come back');

  // 5. the backpack off again (Tab with no vehicle by: what one has on)
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.walker.place(g.player.walker.x, g.player.walker.z, 0, 0);
  });
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.lookVehicle = null;
    g.listV = 'self';
    g.takeFromList();
  });
  const off = await page.evaluate(() => ({ slots: window.__rt.game.player.slots.length, pack: window.__rt.game.player.pack?.item ?? null, held: window.__rt.game.player.slots.map((h) => (h?.kind === 'item' ? h.item.item : '')) }));
  if (off.slots !== 2 || off.pack || !off.held.includes('pack_std')) fail(`the backpack did not come off into the hands ${JSON.stringify(off)}`);
  await rt('drop');

  // 6. the can out of the sedan from Tab's list
  await rt('aim', sd, 'door_FR', 1.6);
  await page.evaluate(() => window.__rt.game.toggleCargoList());
  await rt('simulate', 0.1);
  const list = await page.evaluate(() => document.querySelector('.mc-cargo')?.textContent ?? '');
  await page.screenshot({ path: 'loop/shots/modcar_stow/list.png' }).catch(() => {});
  await page.evaluate(() => window.__rt.game.takeFromList());
  const took = await rt('telemetry');
  if (!/油桶/.test(list)) fail(`the list does not show the can (${list})`);
  if (took.held !== 'tool:jerrycan') fail(`the can did not come out of the list into the hands (${took.held})`);
  if ((await rt('stowed', sd)).load > 0.1) fail('the sedan still weighs the can');
  await rt('drop');

  // 7. the box out of the bed with E
  await rt('aimLoose', 'item:crate_parts', 1.2);
  const t7 = await rt('telemetry');
  await rt('press');
  const out = await rt('telemetry');
  if (out.held !== 'item:crate_parts') fail(`the box did not come out of the bed (aimed ${t7.target}, held ${out.held})`);
  if ((await rt('stowed', pk)).things.length) fail('the bed still has the box');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_stow: ${bad} FAILED` : 'modcar_stow: ok');
process.exit(bad ? 1 : 0);
