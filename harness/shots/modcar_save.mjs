// The game kept in the browser (src/game/modcar/save.ts): fit a part, save, reload — the workshop comes
// back as it was left, what was in the hands in them again; F9 twice — a new game; a test drive
// (?start=road) is never kept.
//   SHOTS_GPU=1 node harness/shots/modcar_save.mjs
import { launchBrowser, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  // a new game: fit the battery (the bonnet first), hold the wheel
  const before = await page.evaluate(() => ({ keep: window.__rt.params.keep, battery: !!window.__rt.game.vehicles[0].build.parts.battery, loose: window.__rt.game.loose.list.length }));
  if (!before.keep || before.battery) fail(`not a new kept game ${JSON.stringify(before)}`);
  await rt('aim', 0, 'hood', 1.5);
  await rt('press');
  await rt('simulate', 0.8);
  await rt('pickUp', 'bat_std');
  await rt('aim', 0, 'battery', 1.4);
  await rt('useFor', 1.6);
  // the petrol can into the donor: picked up with the left button (the mark on it, not on the diesel can lying by it), Q
  // looking into its bed (docs/V3/plan/growth.md §二, J1: Q puts down — looking at a vehicle, into it). It was put down
  // in front of one standing by the Mule's back seat, and fell to the floor beside its door: the one failure, since J4.
  const picked = await page.evaluate(() => {
    const g = window.__rt.game;
    const l = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
    if (!l) return 'no petrol can';
    const w = g.player.walker;
    g.viewMode = 'cockpit';
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      w.place(l.x + Math.cos(a) * 0.9, l.z + Math.sin(a) * 0.9, a + Math.PI);
      for (let i = 0; i < 3; i++) {
        const eye = w.eye();
        g.input.lookYaw = Math.atan2(l.z - w.z, l.x - w.x);
        g.input.lookPitch = Math.atan2(l.y + l.mid - eye.y, Math.hypot(l.x - w.x, l.z - w.z));
        g.simulate(i ? 0.05 : 0);
      }
      if (window.__rt.telemetry().target === `loose:${l.uid}`) break;
    }
    window.__rt.press();
    return g.player.held?.tool?.fuel ?? 'nothing';
  });
  if (picked !== 'petrol') fail(`the petrol can not picked up (${picked})`);
  await rt('aimZone', 1, 'bed', 1.2);
  await rt('simulate', 0.5);
  await page.keyboard.press('KeyQ');
  await page.evaluate(() => {
    const g = window.__rt.game;
    for (let i = 0; i < 60; i++) g.step(1 / 60, 1);
  });
  await rt('pickUp', 'rim_steel13');
  const fitted = await page.evaluate(() => ({ battery: !!window.__rt.game.vehicles[0].build.parts.battery, held: window.__rt.telemetry().held, loose: window.__rt.game.loose.list.length }));
  await page.evaluate(() => window.__rt.game.save());
  // again
  await page.reload({ waitUntil: 'domcontentloaded' });
  await ready();
  const after = await page.evaluate(() => {
    const g = window.__rt.game;
    const can = g.loose.list.find((x) => x.tool?.kind === 'jerrycan' && x.tool.fuel === 'petrol');
    return { battery: !!g.vehicles[0].build.parts.battery, loose: g.loose.list.length, vehicles: g.vehicles.length, done: [...g.done], held: window.__rt.telemetry().held, canRides: can?.riding?.on === g.vehicles[1], toast: document.querySelector('.mc-toast')?.textContent ?? '' };
  });
  console.log('fitted', JSON.stringify(fitted));
  console.log('after reload', JSON.stringify(after));
  if (!after.battery) fail('the battery is not on the car after the reload');
  // (the wheel that was in the hands is in them again: the hotbar is kept)
  if (after.held !== 'rim_steel13') fail(`the wheel is not back in the hands (${after.held})`);
  if (after.loose !== fitted.loose) fail(`things lying about: ${after.loose}, expected ${fitted.loose}`);
  if (after.vehicles !== 4) fail('the vehicles in the yard are gone');
  if (!after.canRides) fail("the can in the donor's bed did not come back on board");
  if (!after.done.includes('hood')) fail('the checklist forgot the bonnet');
  // F9 twice: a new game
  await page.keyboard.press('F9');
  await page.keyboard.press('F9');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  await ready();
  const fresh = await page.evaluate(() => ({ battery: !!window.__rt.game.vehicles[0].build.parts.battery, saved: !!localStorage.getItem('modcar.save.v1') }));
  console.log('after F9 F9', JSON.stringify(fresh));
  if (fresh.battery) fail('F9 twice did not begin a new game');
  // a test drive is not the game: never kept
  await page.goto(`${url}/modcar.html?start=road&build=stock:moto`, { waitUntil: 'domcontentloaded' });
  await ready();
  const drive = await page.evaluate(() => {
    window.__rt.game.save();
    return { keep: window.__rt.params.keep, saved: localStorage.getItem('modcar.save.v1') };
  });
  // (what is stored is still the game in the workshop, written as its page went away: not the moto on the road)
  const stored = drive.saved ? JSON.parse(drive.saved) : null;
  if (drive.keep || stored?.place === 'road') fail('a test drive was kept');
  // a game left on the road goes on on the road, in the same vehicle, about as far along
  const left = await page.evaluate(async () => {
    const g = window.__rt.game;
    g.seated.sim.setParkBrake(false);
    g.scripted = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    g.simulate(6);
    g.scripted = null;
    const s = g.snapshot();
    localStorage.setItem('modcar.save.v1', JSON.stringify(s));
    return { s: s.road.s, x: g.seated.sim.px, frame: s.vehicles[0].build.frame, n: s.vehicles.length };
  });
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  const road = await page.evaluate(() => {
    const g = window.__rt.game;
    return { place: g.place, frame: g.seated?.build.frame, x: g.seated?.sim.px, keep: window.__rt.params.keep };
  });
  console.log('left on the road', JSON.stringify(left), 'back', JSON.stringify(road));
  if (road.place !== 'road' || road.frame !== 'moto' || Math.abs(road.x - left.x) > 30 || !road.keep) fail('the road game did not come back');
  await page.evaluate(() => localStorage.removeItem('modcar.save.v1'));
  if (errors.length) fail(`page errors ${errors.slice(0, 3)}`);
  await ctx.close();
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'save ok');
process.exit(bad ? 1 : 0);
