// A gamepad in the game (docs/MODCAR.md §24), a pretend one in the standard layout:
//  1. it is noticed, and the key card has its buttons;
//  2. the left stick walks;
//  3. RT takes up what one looks at; RB and LB go through the hotbar; Y held puts it down;
//  4. in the seat: A lets the handbrake off (a press, as Space does), RT is the throttle (the engine running, it
//     drives off), LT the brake, RB changes the view, X gets out;
//  5. the pad's motors: shaken while seated with the engine running (the small one by the engine and the road),
//     still once out of the seat.
//   SHOTS_GPU=1 node harness/shots/modcar_pad.mjs
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
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 240000 });
  await rt('setHour', 11);
  // the pretend pad: nothing held
  await page.evaluate(() => {
    const b = () => ({ pressed: false, touched: false, value: 0 });
    window.__rumble = [];
    const vibrationActuator = { type: 'dual-rumble', playEffect: (type, p) => (window.__rumble.push({ type, ...p }), Promise.resolve('complete')) };
    window.__pad = { id: 'Pretend Pad (STANDARD GAMEPAD Vendor: 0000)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, b), timestamp: 0, vibrationActuator };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad], configurable: true });
  });
  const press = (i, v = 1) =>
    page.evaluate(
      ({ i, v }) => {
        const b = window.__pad.buttons[i];
        b.value = v;
        b.pressed = v > 0.5;
      },
      { i, v },
    );
  const tap = async (i) => {
    await press(i);
    await rt('simulate', 0.05);
    await press(i, 0);
    await rt('simulate', 0.05);
  };
  const stick = (a) => page.evaluate((a) => (window.__pad.axes = a), a);
  const pl = () => page.evaluate(() => window.__rt.game.player.telemetry());

  // 1. noticed
  await rt('simulate', 0.1);
  const name = await page.evaluate(() => window.__rt.game.pad.name);
  const card = await page.evaluate(() => document.querySelector('.mc-help')?.textContent ?? '');
  console.log('pad', name, card.includes('手柄') ? 'on the card' : 'NOT on the card');
  if (!name.startsWith('Pretend Pad')) fail(`the pad was not noticed (${name})`);
  if (!card.includes('手柄') || !card.includes('RT')) fail('the key card has no gamepad buttons');

  // 2. the left stick walks
  const a = await pl();
  await stick([0, -1, 0, 0]);
  await rt('simulate', 1.0);
  await stick([0, 0, 0, 0]);
  await rt('simulate', 0.2);
  const b = await pl();
  const walked = Math.hypot(b.footX - a.footX, b.footZ - a.footZ);
  console.log('walked', walked.toFixed(2));
  if (walked < 1) fail(`the left stick did not walk (${walked.toFixed(2)} m)`);

  // 3. RT takes up what one looks at
  const id = await page.evaluate(() => window.__rt.game.loose.list.find((l) => l.part && !l.riding)?.part.part ?? null);
  if (!id) fail('nothing lying about to take up');
  else {
    const aimed = await rt('aimLoose', id, 1.0, 'free');
    await press(7);
    await rt('simulate', 0.1);
    await press(7, 0);
    await rt('simulate', 0.2);
    const t = await pl();
    console.log('took', id, aimed, JSON.stringify({ held: t.held, sel: t.sel }));
    if (t.held !== id) fail(`RT did not take up the ${id} (in the hands: ${t.held})`);
    // RB, LB: through the hotbar
    await tap(5);
    const s1 = (await pl()).sel;
    await tap(4);
    const s2 = (await pl()).sel;
    console.log('hotbar', t.sel, '→', s1, '→', s2);
    if (s1 === t.sel || s2 !== t.sel) fail(`the shoulders do not go through the hotbar (${t.sel} → ${s1} → ${s2})`);
    // Y held: put down
    await press(3);
    await rt('simulate', 1.2);
    await press(3, 0);
    await rt('simulate', 0.3);
    const d = await pl();
    console.log('put down', JSON.stringify({ held: d.held }));
    if (d.held === id) fail('holding Y did not put it down');
  }

  // 4. in the seat
  const builds = await rt('builds');
  const vi = builds.findIndex((s) => s.startsWith('pickup') || s.startsWith('stock:pickup'));
  await rt('setBuild', vi, 'stock:pickup');
  await rt('enter', vi);
  await rt('setView', 'cockpit');
  await rt('crank', 2.5);
  // (it was left with its handbrake on: a press of A lets it off)
  await tap(0);
  await rt('simulate', 0.3);
  const park = await page.evaluate((i) => window.__rt.game.vehicles[i].sim.parkBrake, vi);
  if (park) fail(`A did not let the handbrake off (${park})`);
  const x0 = await page.evaluate((i) => window.__rt.game.vehicles[i].sim.px, vi);
  await press(7);
  await rt('simulate', 1.0);
  await press(7, 0);
  const kmh = await page.evaluate((i) => window.__rt.game.vehicles[i].sim.kmh, vi);
  await press(6);
  await rt('simulate', 1.0);
  await press(6, 0);
  const after = await page.evaluate((i) => ({ kmh: window.__rt.game.vehicles[i].sim.kmh, x: window.__rt.game.vehicles[i].sim.px }), vi);
  console.log('drove', JSON.stringify({ kmh, moved: Math.abs(after.x - x0), braked: after.kmh }));
  if (kmh < 3) fail(`RT did not drive it off (${kmh.toFixed(1)} km/h)`);
  if (Math.abs(after.kmh) > Math.abs(kmh) * 0.6) fail(`LT did not brake (${after.kmh.toFixed(1)} km/h)`);
  await tap(5);
  const v1 = await page.evaluate(() => window.__rt.game.viewMode);
  await tap(5);
  const v2 = await page.evaluate(() => window.__rt.game.viewMode);
  console.log('views', v1, v2);
  if (v1 !== 'chase' || v2 !== 'cockpit') fail(`RB does not change the view (${v1}, ${v2})`);
  await rt('simulate', 1.0);
  // 5. the motors, while seated with the engine running
  const shook = await page.evaluate(() => window.__rumble.slice());
  const weak = Math.max(0, ...shook.map((e) => e.weakMagnitude));
  console.log('rumble', shook.length, 'effects, weak up to', weak.toFixed(2), 'strong up to', Math.max(0, ...shook.map((e) => e.strongMagnitude)).toFixed(2));
  if (!shook.length || weak < 0.02) fail(`the pad was not shaken in the seat (${shook.length} effects, weak ${weak})`);
  if (shook.some((e) => e.type !== 'dual-rumble' || !(e.duration > 0))) fail('a rumble effect of the wrong kind');
  await tap(2);
  await rt('simulate', 0.3);
  const seated = await page.evaluate(() => !!window.__rt.game.seated);
  console.log('got out', !seated);
  if (seated) fail('X did not get out');
  const n0 = await page.evaluate(() => window.__rumble.length);
  await rt('simulate', 0.8);
  const n1 = await page.evaluate(() => window.__rumble.length);
  if (n1 !== n0) fail(`the pad went on shaking out of the seat (${n1 - n0} effects)`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser.close();
  server.close();
}
console.log(bad ? `modcar_pad: ${bad} FAILED` : 'modcar_pad: ok');
process.exit(bad ? 1 : 0);
