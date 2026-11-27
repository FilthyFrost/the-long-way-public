// The item cards and the hotbar (docs/MODCAR.md §5.5), in the live game loop with the real keys: what the mark
// is on close by gets a card (a thing lying about, a part on a vehicle, the vehicle itself with what it
// still needs, a workshop machine; nothing from a few metres off), what is in the hands a card on the right;
// E picks things up into the hotbar's two slots (a third will not go: two hands), 1 and 2 put one or the
// other in the hands, I hides and shows the cards (and is remembered), G held puts down; in the seat the
// hotbar stays and the right lists the driving keys, and nothing of the vehicle's readings is in the corner of the
// screen (they are on the cab's own instruments: cluster.ts). Writes loop/shots/modcar_hud/*.png.
//   SHOTS_GPU=1 node harness/shots/modcar_hud.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, holdKeyUntil, launchBrowser, settle as settleGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/modcar_hud');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  await page.goto(`${url}/modcar.html?new=1`);
  await ready();
  await page.evaluate(() => window.__rt.game.ui.showHelp(false));
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const tele = () => page.evaluate(() => window.__rt.game.player.telemetry());
  const hud = () =>
    page.evaluate(() => {
      const shown = (sel) => {
        const e = document.querySelector(sel);
        return !!e && e.style.display !== 'none';
      };
      const text = (sel) => (shown(sel) ? document.querySelector(sel).textContent : '');
      return {
        aim: shown('.mc-ic.aim') ? document.querySelector('.mc-ic.aim .nm').textContent : '',
        aimText: text('.mc-ic.aim'),
        aimStars: Number(document.querySelector('.mc-ic.aim .st')?.dataset.stars ?? 0),
        held: shown('.mc-ic.held') ? document.querySelector('.mc-ic.held .nm').textContent : '',
        heldText: text('.mc-ic.held'),
        acts: text('.mc-acts'),
        keys: text('.mc-keys'),
        slots: [...document.querySelectorAll('.mc-hot .s')].map((s) => ({ on: s.classList.contains('on'), title: s.getAttribute('title') })),
        hot: shown('.mc-hot'),
      };
    });
  // (a wait for the game's own frames as well as the clock: a software renderer is slower than 250 ms a frame)
  const settle = (ms = 250) => settleGame(page, ms, 3);
  const shot = (name) => page.screenshot({ path: path.join(out, `${name}.png`) });

  // ---- a thing lying about: its card beside the mark, E picks it up into the hands
  if (!(await rt('aimLoose', 'bat_std', 1.0))) fail('could not stand before the battery');
  await settle();
  // (the first frames of the loop can still nudge the walker off it: stand there again)
  for (let i = 0; i < 3 && !(await tele()).target.startsWith('loose'); i++) {
    await rt('aimLoose', 'bat_std', 1.0);
    await settle(400);
  }
  let h = await hud();
  console.log('at the battery', JSON.stringify({ aim: h.aim, acts: h.acts }));
  if (h.aim !== '电瓶') fail(`no card for the battery beside the mark (${h.aim})`);
  if (!/电量/.test(h.aimText) || !h.aimStars) fail('the battery card lacks its charge or its stars');
  if (!/拿起/.test(h.acts)) fail(`no "pick up" over the hotbar (${h.acts})`);
  await shot('01_lying');
  await page.evaluate(() => window.__rt.press());
  await settle();
  let t = await tele();
  if (t.slot1 !== 'bat_std' || t.sel !== 0) fail(`the battery is not in slot 1 (${JSON.stringify(t)})`);
  h = await hud();
  if (h.held !== '电瓶') fail(`no card for the battery in the hands (${h.held})`);

  // ---- a second thing: into the other slot (the first goes to the pocket)
  if (!(await rt('aimLoose', 'tool:jerrycan', 1.0))) fail('could not stand before the jerrycan');
  await settle();
  h = await hud();
  // (one verb and the name since docs/V3/plan/prompts.md §五: the hotbar shows where it goes)
  if (!/拿起/.test(h.acts) || /快捷栏/.test(h.acts)) fail(`picking up with something in the hands: one verb and the name (${h.acts})`);
  await page.evaluate(() => window.__rt.press());
  await settle();
  t = await tele();
  if (t.slot1 !== 'bat_std' || t.slot2 !== 'tool:jerrycan' || t.sel !== 1) fail(`not both in the hotbar (${JSON.stringify(t)})`);
  h = await hud();
  if (!/油桶/.test(h.held)) fail(`the can is not in the hands (${h.held})`);
  if (!h.slots[1]?.on) fail('slot 2 is not the one shown in use');
  await shot('02_two_slots');

  // ---- a third will not go
  const lying = await page.evaluate(() => window.__rt.game.loose.list.length);
  if (!(await rt('aimLoose', 'rim_steel13', 1.0))) {
    // (with both hands full the mark is not on it: stand there and look anyway)
    await page.evaluate(() => {
      const g = window.__rt.game;
      const l = g.loose.list.find((x) => x.part?.part === 'rim_steel13');
      const w = g.player.walker;
      w.place(l.x + 1, l.z, 0, 0);
      g.input.lookYaw = Math.PI;
      g.input.lookPitch = -0.8;
    });
  }
  await page.evaluate(() => window.__rt.press());
  await settle();
  if ((await page.evaluate(() => window.__rt.game.loose.list.length)) !== lying) fail('a third thing was picked up');

  // ---- 1 and 2
  await page.keyboard.press('Digit1');
  await settle();
  t = await tele();
  h = await hud();
  if (t.sel !== 0 || t.held !== 'bat_std' || h.held !== '电瓶') fail(`1 did not put the battery in the hands (${JSON.stringify(t)}, ${h.held})`);
  await page.keyboard.press('Digit2');
  await settle();
  if ((await tele()).held !== 'tool:jerrycan') fail('2 did not put the can back in the hands');

  // ---- I hides the cards, and is remembered
  await page.evaluate(() => window.__rt.game.toggleCards());
  await settle();
  h = await hud();
  if (h.held || h.aim) fail('I did not hide the cards');
  // (the I key is gone since docs/V3/plan/growth.md J1: the cards keep the setting saved, no key to say)
  if ((await page.evaluate(() => localStorage.getItem('modcar.ui.cards'))) !== '0') fail('hiding the cards was not remembered');
  await page.evaluate(() => window.__rt.game.toggleCards());
  await settle();
  if (!(await hud()).held) fail('I did not show the cards again');

  // ---- G held puts down what is in the hands
  // (held until the can is down, however slowly the frames come; the check below still fails if it never is)
  // (Q puts it down now: docs/V3/plan/growth.md J1)
  await page.keyboard.press('KeyQ');
  await settle();
  t = await tele();
  if (t.slot2 !== '' || t.slot1 !== 'bat_std') fail(`G did not put the can down (${JSON.stringify(t)})`);

  // ---- a part on a vehicle; the vehicle itself, with what it still needs; a machine
  await page.evaluate(() => (window.__rt.game.player.slots[0] = window.__rt.game.player.slots[1] = null));
  await rt('aim', 0, 'door_FL', 1.5);
  await settle();
  h = await hud();
  // (the whole card, whatever the mark is on — a fitted part too, with where it is fitted and its state as Nomad Drive
  // words it: docs/V3/plan/finish.md §十九)
  if (h.aim !== '车门' || !/装在/.test(h.aimText) || !/状态(极佳|良好|一般|较差)\s*\d+%|已损坏/.test(h.aimText)) fail(`the fitted door's card is not the whole card with its state (${h.aim}: ${h.aimText})`);
  if (!/拆下/.test(h.acts)) fail(`no "take off" for the door (${h.acts})`);
  await shot('03_fitted');
  // a few metres off its side, looking at it: no card from there (it would stand in the way of the view)
  const standOff = (m) =>
    page.evaluate((m) => {
      const g = window.__rt.game;
      const v = g.vehicles[0];
      const w = g.player.walker;
      const b = new Float64Array(9);
      v.sim.basis(b);
      w.place(v.sim.px + b[6] * m, v.sim.pz + b[8] * m, 0, 0);
      g.input.lookYaw = Math.atan2(v.sim.pz - w.z, v.sim.px - w.x);
      g.input.lookPitch = -0.18;
    }, m);
  await standOff(4.5);
  await settle(400);
  h = await hud();
  if (h.aim) fail(`a card for what the mark is on from 4.5 m off (${h.aim})`);
  // close by: the vehicle's card, with what it still needs (looked for over its side: the body between its parts)
  await standOff(1.9);
  await settle(300);
  h = await hud();
  search: for (const pitch of [-0.18, -0.35, -0.05, -0.5, 0.05]) {
    for (const yaw of [0, -0.25, 0.25, -0.5, 0.5, -0.75, 0.75]) {
      if (h.aim === '方糖') break search;
      await page.evaluate(
        ({ pitch, yaw }) => {
          const g = window.__rt.game;
          const v = g.vehicles[0];
          const w = g.player.walker;
          g.input.lookYaw = Math.atan2(v.sim.pz - w.z, v.sim.px - w.x) + yaw;
          g.input.lookPitch = pitch;
        },
        { pitch, yaw },
      );
      await settle(150);
      h = await hud();
    }
  }
  // (her eye is level with the Sugar Cube's roof, 1.4 m: from beside the doors nothing of the body itself is within
  // reach any more — beside a wing it is, over the wheel arch; the view a hand's breadth ahead of her eyes since
  // 2026-11-26, a step further off too)
  wings: for (const off of [1.75, 1.95])
  for (const along of [1.45, -1.55]) {
    for (const pitch of [-0.3, -0.45, -0.2, -0.6]) {
      for (const yaw of [0, -0.2, 0.2, -0.4, 0.4]) {
        if (h.aim === '方糖') break wings;
        await page.evaluate(
          ({ along, pitch, yaw, off }) => {
            const g = window.__rt.game;
            const v = g.vehicles[0];
            const w = g.player.walker;
            const b = new Float64Array(9);
            v.sim.basis(b);
            const tx = v.sim.px + b[0] * along;
            const tz = v.sim.pz + b[2] * along;
            w.place(tx + b[6] * off, tz + b[8] * off, 0, 0);
            g.input.lookYaw = Math.atan2(tz - w.z, tx - w.x) + yaw;
            g.input.lookPitch = pitch;
          },
          { along, pitch, yaw, off },
        );
        await settle(150);
        h = await hud();
      }
    }
  }
  console.log('at the car', JSON.stringify({ aim: h.aim, text: h.aimText.slice(0, 200) }));
  if (h.aim !== '方糖') fail(`no card for the vehicle close by (${h.aim})`);
  if (!/电瓶|发动机/.test(h.aimText)) fail('the vehicle card does not say what it still needs');
  await shot('04_vehicle');
  await page.evaluate(() => {
    const g = window.__rt.game;
    const d = g.devices.find((x) => x.id === 'door');
    const w = g.player.walker;
    w.place(d.x - 1.2, d.z, 0, 0);
    ({ yaw: g.input.lookYaw, pitch: g.input.lookPitch } = w.lookAt(d.x, d.y, d.z));
  });
  await settle(400);
  h = await hud();
  if (h.aim !== '大门按钮' || !/大门关着/.test(h.aimText)) fail(`no card for the door button (${h.aim}: ${h.aimText})`);
  await shot('05_device');

  // ---- in the seat: the hotbar stays, the right lists the driving keys, no cards
  await rt('hold', 'tool:oilcan', { litres: 2 });
  await page.evaluate(() => window.__rt.game.enter(window.__rt.game.vehicles[1]));
  await settle(400);
  h = await hud();
  if (!h.hot || !h.slots.some((s) => s.title?.startsWith('机油壶'))) fail(`no hotbar in the seat (${JSON.stringify(h.slots)})`);
  if (!/手刹/.test(h.keys) || !/下车/.test(h.keys)) fail(`no driving keys on the right (${h.keys})`);
  if (h.held || h.aim) fail('cards in the seat');
  // (no readings in the corner of the screen: the cab's own instruments show them — the player's ask, 2026-11-26)
  const inCab = await page.evaluate(() => {
    const g = window.__rt.game;
    const c = g.seated?.view.cluster;
    return { corner: !!document.querySelector('.mc-dash'), cluster: !!c, faces: !!c && c.group.visible };
  });
  if (inCab.corner) fail('readings in the corner of the screen in the seat');
  if (!inCab.cluster || !inCab.faces) fail(`no instruments in the cab (${JSON.stringify(inCab)})`);
  await shot('06_seat');
  await page.evaluate(() => window.__rt.game.getOut());
  await settle();
  if ((await tele()).held !== 'tool:oilcan') fail('the oil can did not come along through the seat');

  const lastError = await page.evaluate(() => window.__rt.lastError);
  if (lastError) fail(`a frame threw: ${lastError}`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await ctx.close();
} catch (e) {
  fail(e.message);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_hud: ${bad} FAILED` : 'modcar_hud: ok');
process.exit(bad ? 1 : 0);
