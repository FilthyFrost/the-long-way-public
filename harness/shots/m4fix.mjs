// The M4 fixes the player asked for (docs/V3/nodes/M4-fixes.md), seen and checked in the game:
//   1 relieving oneself: the archive's recordings (the start, the stream on what it falls on, the end) and the stream seen
//   2 out of breath and the heart: the archive's recordings, a breath or a beat at a time
//   5 C on foot: crouched and up again (in the seat: the view)
//   4 the motorhome: walked into by its open side door and out of it, no key
//   SHOTS_GPU=1 node harness/shots/m4fix.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/m4fix');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));
try {
  const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&seed=7&start=road&build=stock:rv&s=300&time=15.5&weather=clear`, { width: 1600, height: 900 });
  const step = (n = 6) => page.evaluate((n) => { const g = window.__rt.game; for (let i = 0; i < n; i++) g.simulate(1 / 30); }, n);
  const shot = async (f) => {
    await page.evaluate(async () => {
      const g = window.__rt.game;
      g.player.clearHighlight();
      g.ui.showHelp(false);
      for (let i = 0; i < 200 && (g.worldView?.pending ?? 0) > 0; i++) {
        g.worldView.update(g.player.walker.x, g.player.walker.z, 40);
        await new Promise((r) => setTimeout(r, 0));
      }
      window.__rt.render();
    });
    await page.screenshot({ path: path.join(out, f) });
  };
  const played = (re) => page.evaluate((src) => Object.entries(window.__rt.game.soundStatus().played).filter(([k]) => new RegExp(src).test(k)).reduce((n, [, v]) => n + v, 0), re.source);
  const state = () =>
    page.evaluate(() => {
      const g = window.__rt.game;
      const w = g.player.walker;
      const ab = g.player.aboard;
      return { seated: !!g.seated, aboard: ab ? { x: +ab.w.x.toFixed(2), z: +ab.w.z.toFixed(2) } : null, crouched: w.crouched, eye: +(g.player.eye.y - w.y).toFixed(2), footing: g.footing() };
    });
  await page.evaluate(() => window.__rt.game.audio.start());
  await step(2);
  await page.waitForFunction(() => window.__rt.game.soundStatus().decoded >= 150, null, { timeout: 120000 }).catch(() => null);
  if (await page.evaluate(() => !!window.__rt.game.seated)) await page.evaluate(() => window.__rt.exit());
  await step(10);

  // ---- 5. C on foot: crouched, and up again
  let s0 = await state();
  await page.keyboard.press('KeyC');
  await step(12);
  let s1 = await state();
  ok(s1.crouched && s1.eye < s0.eye - 0.3, `C: crouched (eye ${s0.eye} → ${s1.eye} m)`);
  await shot('5a_crouched.png');
  await page.keyboard.press('KeyC');
  await step(12);
  const s2 = await state();
  ok(!s2.crouched && Math.abs(s2.eye - s0.eye) < 0.05, `C again: standing (eye ${s2.eye} m)`);

  // ---- 1. relieving oneself, on the road (its recordings: the concrete's), looking down at it
  // (its recordings in first, as they are a little while into a game)
  await page.evaluate(() => {
    const a = window.__rt.game.foley.archive;
    for (const c of ['pee_start', 'pee:concrete', 'pee:snow', 'pee_end', 'pee_relief']) a.warm(c);
  });
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.body.bladder = 90;
    g.input.lookPitch = -0.95;
  });
  const p0 = { start: await played(/^pee_start$/), stream: await played(/^pee:/), end: await played(/^pee_end$/) };
  await page.keyboard.down('KeyP');
  await step(45);
  const flowing = await page.evaluate(() => {
    const g = window.__rt.game;
    return { live: g.pee.live, thrown: g.pee.thrown, spot: g.pee.spot.visible, footing: g.footing(), loop: g.foley?.playing('pee') ?? false };
  });
  await shot('1a_pee_on_road.png');
  await step(60);
  await shot('1b_pee_on_road_later.png');
  await page.keyboard.up('KeyP');
  await step(20);
  const p1 = { start: await played(/^pee_start$/), stream: await played(/^pee:/), end: await played(/^pee_end$/) };
  ok(flowing.live > 60 && flowing.thrown > 200, `the stream seen: ${flowing.live} drops in the air, ${flowing.thrown} so far`);
  ok(flowing.spot, 'the wet patch on the ground under it');
  ok(flowing.loop, `the stream heard (${flowing.footing} underfoot)`);
  ok(p1.start > p0.start && p1.stream > p0.stream && p1.end > p0.end, `its recordings: the start ${p1.start - p0.start}, the stream ${p1.stream - p0.stream}, the end ${p1.end - p0.end}`);
  await shot('1c_wet_patch_after.png');

  // ---- 2. out of breath: fast pants, slower, then the breath got back; the heart when hurt
  const b0 = { fast: await played(/^breath_fast$/), slow: await played(/^breath_slow$/), end: await played(/^breath_end$/), beat: await played(/^heartbeat$/) };
  await page.evaluate(() => (window.__rt.game.body.stamina = 6));
  await step(4);
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => (window.__rt.game.body.stamina = Math.min(window.__rt.game.body.stamina, 12)));
    await step(3);
  }
  await page.evaluate(() => (window.__rt.game.body.stamina = 32));
  await step(90);
  await page.evaluate(() => (window.__rt.game.body.stamina = 60));
  await step(60);
  await page.evaluate(() => (window.__rt.game.body.hp = 15));
  await step(90);
  await page.evaluate(() => (window.__rt.game.body.hp = 100));
  const b1 = { fast: await played(/^breath_fast$/), slow: await played(/^breath_slow$/), end: await played(/^breath_end$/), beat: await played(/^heartbeat$/) };
  ok(b1.fast - b0.fast >= 3, `out of breath: ${b1.fast - b0.fast} fast pants`);
  ok(b1.slow - b0.slow >= 2, `getting it back: ${b1.slow - b0.slow} slower ones`);
  ok(b1.end - b0.end === 1, `and the breath got back, once (${b1.end - b0.end})`);
  ok(b1.beat - b0.beat >= 3, `hurt: ${b1.beat - b0.beat} heartbeats in 3 s`);

  // ---- 4. the motorhome: its side door open, walked into from outside and out again, no key
  await page.evaluate(() => window.__rt.openPanel(0, 'door_side', true));
  await step(20);
  // standing 1.2 m out from the doorway, facing it
  await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const m = v.view.model;
    m.updateMatrixWorld();
    const e = m.matrixWorld.elements;
    const o = g.core.origin;
    const at = (x, y, z) => ({ x: e[0] * x + e[4] * y + e[8] * z + e[12] + o.x, z: e[2] * x + e[6] * y + e[10] * z + e[14] + o.z });
    const stand = at(-0.08, 0, 1.9 + 1.0);
    const door = at(-0.08, 0, 1.0);
    window.__rt.stand(stand.x, stand.z, Math.atan2(door.z - stand.z, door.x - stand.x), -0.05);
  });
  await step(6);
  await shot('4a_rv_door_from_outside.png');
  const before = await state();
  await page.keyboard.down('KeyW');
  let inside = null;
  for (let i = 0; i < 40 && !inside; i++) {
    await step(3);
    inside = (await state()).aboard;
  }
  await page.keyboard.up('KeyW');
  ok(!before.aboard && !!inside, `walked in by the open side door, no key (${JSON.stringify(inside)})`);
  await step(6);
  await shot('4b_rv_walked_in.png');
  // on in, down the aisle to the back
  await page.evaluate(() => {
    const g = window.__rt.game;
    const ab = g.player.aboard;
    if (ab) g.input.lookYaw = ab.heading() + Math.PI;
  });
  await page.keyboard.down('KeyW');
  await step(75);
  await page.keyboard.up('KeyW');
  const back = await state();
  ok(!!back.aboard && back.aboard.x < -1.5, `walked on to the back of it (${JSON.stringify(back.aboard)})`);
  await shot('4c_rv_rear_inside.png');
  // and out again: back to the door, out through it
  await page.evaluate(() => {
    const g = window.__rt.game;
    const ab = g.player.aboard;
    ab.w.place(-0.08, 0.6, 0);
    g.input.lookYaw = ab.heading() + Math.PI / 2;
    g.input.lookPitch = -0.05;
  });
  await step(4);
  await page.keyboard.down('KeyW');
  let outside = false;
  for (let i = 0; i < 40 && !outside; i++) {
    await step(3);
    outside = !(await state()).aboard;
  }
  await page.keyboard.up('KeyW');
  ok(outside, 'walked out by the side door, no key');
  await step(6);
  await shot('4d_rv_walked_out.png');
  // a closed door is not walked through
  await page.evaluate(() => window.__rt.openPanel(0, 'door_side', false));
  await step(30);
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.input.lookYaw += Math.PI;
  });
  await page.keyboard.down('KeyW');
  await step(60);
  await page.keyboard.up('KeyW');
  ok(!(await state()).aboard, 'the door shut: not walked through');
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'all passed', '— shots in', out);
process.exit(bad ? 1 : 0);
