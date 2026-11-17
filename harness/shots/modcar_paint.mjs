// Spray paint as Arctic Drive has it (src/core/modcar/paint.ts, docs/MODCAR.md §16): the garage's cans (two small
// ones part full, a medium and a large); a can held on a door — the mark says what and in which colour, a door
// does not open under the nozzle — the button held: the door's colour goes over to the can's in 2.9 s (medium),
// the mist fanning out of the nozzle and over the door, the can losing as many units, the ring and the hotbar's
// bar following; half-way let go it stays half-way; done it flashes; the body sprayed on its own (the doors keep
// theirs); what is that colour already costs nothing; a small can runs dry and stops; a wheel takes no paint; a
// bumper lying about takes it; the gun on the compressor paints the whole car from the can; saved and read back,
// the colours and a coat left half-done as they were.
//   SHOTS_GPU=1 node harness/shots/modcar_paint.mjs
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
    await page.screenshot({ path: `loop/shots/modcar_paint_${name}.png` });
  };
  /** hold the use button for `s` seconds (the button stays down: the mist is in the air for the shot); release after */
  const sprayHold = (s, release = true) =>
    page.evaluate(
      ({ s, release }) => {
        const g = window.__rt.game;
        g.player.press();
        let puffs = 0;
        for (let t = 0; t < s - 1e-9; t += 1 / 60) {
          g.player.primary = true;
          g.step(1 / 60, 1);
          puffs = Math.max(puffs, g.mist?.count ?? 0);
        }
        // (how far the coat of what the mark is on is, before anything else moves it)
        const a = g.player.paintAim;
        const p = a ? (a.inst ?? a.v?.build) : null;
        const coat = p ? (p.paintMix ? p.paintMix.t : null) : null;
        const tel = g.player.telemetry();
        const left = g.player.held?.tool?.paint ?? null;
        if (release) {
          g.player.release();
          g.simulate(0);
        }
        return { ...tel, puffs, left, coat, spraying: !!g.player.spraying };
      },
      { s, release },
    );
  const paintOf = (mount) =>
    page.evaluate((mount) => {
      const b = window.__rt.game.vehicles[0].build;
      const p = mount ? b.parts[mount] : b;
      return { paint: p.paint, t: p.paintMix ? p.paintMix.t : null };
    }, mount);
  const canLeft = () => page.evaluate(() => window.__rt.game.player.held?.tool?.paint ?? null);

  await page.goto(`${url}/modcar.html?new=1`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('setHour', 13);
  // (the car clean, the better to see its colour: the paint is its colour, not a coat over the dirt)
  await page.evaluate(() => {
    const b = window.__rt.game.vehicles[0].build;
    b.dirt = b.rust = 0;
    b.crust = 0;
    for (const p of Object.values(b.parts)) {
      p.dirt = p.rust = 0;
      p.crust = 0;
    }
  });
  await rt('simulate', 0.5);

  // 1. the garage's cans, as Arctic Drive's starting garage has them (and a medium and a large beside them)
  const cans = await page.evaluate(() => window.__rt.game.loose.list.filter((l) => l.tool?.kind === 'spray').map((l) => ({ tier: l.tool.tier, colour: l.tool.colour, paint: l.tool.paint })));
  console.log('cans', JSON.stringify(cans));
  const small = cans.filter((c) => c.tier === 1);
  if (small.length !== 2 || small.some((c) => !(c.paint >= 2 && c.paint <= 10 && Number.isInteger(c.paint)))) fail(`not two small cans part full (${JSON.stringify(small)})`);
  if (!cans.some((c) => c.tier === 2) || !cans.some((c) => c.tier === 3)) fail('no medium or no large can');

  // 2. a medium cherry-red can on the front-left door: the mark says so; E does not open the door
  await rt('hold', 'tool:spray', { tier: 2, colour: 13 });
  await rt('aim', 0, 'door_FL', 1.35);
  await rt('simulate', 0.1);
  let tel = await rt('telemetry');
  if (!String(tel.target).startsWith('paint:') || !String(tel.target).endsWith(':door_FL')) fail(`the mark is not on the door to paint (target ${tel.target})`);
  const words = await page.evaluate(() => document.querySelector('.mc-acts')?.textContent ?? '');
  console.log('words', words);
  if (!/喷漆/.test(words) || !/樱桃红/.test(words)) fail(`the words do not say paint it cherry red (${words})`);
  const before = await paintOf('door_FL');
  const body0 = await paintOf(null);
  await shot('aim');
  const open0 = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('door_FL'));
  await page.evaluate(() => {
    const g = window.__rt.game;
    g.player.press('key');
    g.step(1 / 60, 1);
    g.player.release('key');
    g.simulate(0.5);
  });
  const open1 = await page.evaluate(() => window.__rt.game.vehicles[0].view.panelOpen('door_FL'));
  if (open1 > open0 + 0.05) fail(`the door opened under the nozzle (${open0} → ${open1})`);
  const left0 = await canLeft();

  // 3. held 1.4 s: half the coat on, the mist in the air, the can 1.4 units down; let go, it stays half-done
  const mid = await sprayHold(1.4, false);
  await shot('spraying');
  await page.evaluate(() => {
    window.__rt.game.player.release();
    window.__rt.game.simulate(0);
  });
  const half = { paint: 13, t: mid.coat };
  const left1 = mid.left;
  console.log('half', JSON.stringify({ before, half, left0, left1, puffs: mid.puffs, progress: mid.progress }));
  if (half.paint !== 13 || !(half.t > 0.35 && half.t < 0.65)) fail(`the coat is not half on after 1.4 s (${JSON.stringify(half)})`);
  if (!(Math.abs(left0 - left1 - 1.4) < 0.15)) fail(`the can did not lose 1.4 units (${left0} → ${left1})`);
  if (!(mid.puffs > 80)) fail(`no mist (${mid.puffs} puffs)`);
  if (!(mid.progress > 0.35)) fail(`the ring does not follow the coat (${mid.progress})`);
  // (let go: it stays where it is)
  const letGo = await paintOf('door_FL');
  await rt('simulate', 0.6);
  const still = await paintOf('door_FL');
  if (Math.abs(still.t - letGo.t) > 1e-6) fail(`the coat moved without the button (${letGo.t} → ${still.t})`);

  // 4. on to the end: whole, the can down by 2.9 units in all; held on longer, it costs nothing more
  await sprayHold(1.8);
  const done = await paintOf('door_FL');
  const left2 = await canLeft();
  await rt('simulate', 0.05);
  await shot('door_done');
  if (done.paint !== 13 || done.t !== null) fail(`the door is not cherry red all over (${JSON.stringify(done)})`);
  if (!(Math.abs(left0 - left2 - 1 / 0.35) < 0.15)) fail(`a door did not take 2.9 units (${left0} → ${left2})`);
  await sprayHold(1.0);
  const left3 = await canLeft();
  if (Math.abs(left3 - left2) > 1e-6) fail(`spraying a door that is that colour already cost paint (${left2} → ${left3})`);
  const others = await paintOf('door_RL');
  if (others.paint === 13) fail('the rear door was painted too');
  const bodyNow = await paintOf(null);
  if (bodyNow.paint !== body0.paint) fail('the body was painted with the door');

  // 5. the body on its own (aimed at its windscreen: the body is one thing, windows and all): the doors that wore its colour keep it
  const ws = await page.evaluate(() => {
    const g = window.__rt.game;
    const v = g.vehicles[0];
    const p = v.view.windscreenAt(v.view.root.position.clone());
    const o = g.core.origin;
    const b = new Float64Array(9);
    v.sim.basis(b);
    return { x: p.x + o.x, y: p.y + o.y, z: p.z + o.z, fwd: Math.atan2(b[2], b[0]) };
  });
  await rt('aimPoint', ws.x, ws.y, ws.z, ws.fwd + 0.3, 1.2);
  tel = await rt('telemetry');
  console.log('body aim', tel.target);
  if (!String(tel.target).endsWith(':frame')) fail(`the mark is not on the body (target ${tel.target})`);
  const frWas = await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    return { paint: v.build.parts.door_FR.paint, shown: v.view.paintBase('p:door_FR') };
  });
  await sprayHold(3.2);
  const body = await paintOf(null);
  const fr = await page.evaluate(() => {
    const v = window.__rt.game.vehicles[0];
    return { paint: v.build.parts.door_FR.paint, shown: v.view.paintBase('p:door_FR') };
  });
  console.log('body', JSON.stringify({ body, frWas, fr }));
  if (body.paint !== 13 || body.t !== null) fail(`the body is not cherry red (${JSON.stringify(body)})`);
  if (fr.shown !== frWas.shown) fail(`the right front door changed with the body (${frWas.shown.toString(16)} → ${fr.shown.toString(16)})`);
  await rt('aim', 0, 'door_FL', 2.6);
  await rt('simulate', 0.1);
  await shot('body_done');

  // 6. a small can with one unit: a quarter of a coat on the rear door, then dry; dry, it paints nothing
  await rt('hold', 'tool:spray', { tier: 1, colour: 26, paint: 1 });
  await rt('aim', 0, 'door_RL', 1.35);
  await sprayHold(2.0);
  const dry = await paintOf('door_RL');
  const leftDry = await canLeft();
  console.log('dry', JSON.stringify({ dry, leftDry }));
  if (leftDry !== 0) fail(`the small can did not run dry (${leftDry})`);
  if (dry.paint !== 26 || !(dry.t > 0.15 && dry.t < 0.35)) fail(`one unit of a small can is not a quarter of a coat (${JSON.stringify(dry)})`);
  const r2 = await sprayHold(1.0);
  if ((await paintOf('door_RL')).t !== dry.t) fail('an empty can still paints');
  const hot = await page.evaluate(() => window.__rt.game.player.slotViews()[window.__rt.game.player.sel]);
  console.log('hotbar', JSON.stringify({ name: hot.name, fill: hot.fill }), r2.held);
  if (!hot.fill || hot.fill.max !== 10 || hot.fill.value !== 0 || !hot.fill.colour) fail(`the hotbar's bar does not show the small can empty in its colour (${JSON.stringify(hot.fill)})`);
  if (!/小喷漆罐（钴蓝）/.test(hot.name)) fail(`the can's name (${hot.name})`);

  // 7. an engine takes no paint (and says so)
  await rt('hold', 'tool:spray', { tier: 3, colour: 23 });
  await rt('aimLoose', 'eng_i4', 1.1, 'free');
  await rt('simulate', 0.1);
  tel = await rt('telemetry');
  const wordsEng = await page.evaluate(() => document.querySelector('.mc-acts')?.textContent ?? '');
  const engAim = await page.evaluate(() => {
    const a = window.__rt.game.player.paintAim;
    return a ? { label: a.label, paintable: a.paintable } : null;
  });
  console.log('engine', tel.target, JSON.stringify(engAim), wordsEng);
  // (an engine lying about: no paint, but E picks it up as ever)
  if (String(tel.target).startsWith('paint:') || engAim?.paintable !== false) fail(`an engine is a paint target (${tel.target} ${JSON.stringify(engAim)})`);
  if (/喷漆/.test(wordsEng)) fail(`the words offer to paint the engine (${wordsEng})`);
  // a headlamp on the car: nothing else to do with a can there, the words say it takes no paint
  await rt('aim', 0, 'headlight_L', 0.9);
  await rt('simulate', 0.1);
  const lamp = await page.evaluate(() => {
    const a = window.__rt.game.player.paintAim;
    return { aim: a ? { owner: a.owner, paintable: a.paintable } : null, words: document.querySelector('.mc-acts')?.textContent ?? '' };
  });
  console.log('lamp', JSON.stringify(lamp));
  if (lamp.aim?.owner === 'm:headlight_L' && !/不能喷漆/.test(lamp.words)) fail(`the words do not say the lamp takes no paint (${lamp.words})`);
  if (lamp.aim?.owner !== 'm:headlight_L') console.log('(the mark is not on the lamp: not checked)');

  // 8. a bumper lying about takes paint too
  const ram = await page.evaluate(() => {
    const l = window.__rt.game.loose.list.find((x) => x.part?.part === 'bf_ram');
    return l ? { uid: l.part.uid, paint: l.part.paint } : null;
  });
  if (!ram) fail('no bumper lying about');
  else {
    // (from whichever side the mark meets it first: the floor about it is crowded)
    const at = await page.evaluate((uid) => {
      const l = window.__rt.game.loose.list.find((x) => x.part?.uid === uid);
      return { x: l.x, y: l.y + l.mid, z: l.z, uid: l.uid };
    }, ram.uid);
    for (let k = 0; k < 8; k++) {
      await rt('aimPoint', at.x, at.y, at.z, (k * Math.PI) / 4, 1.1);
      await rt('simulate', 0.05);
      if ((await page.evaluate(() => window.__rt.game.player.paintAim?.owner ?? '')) === `l:${at.uid}`) break;
    }
    tel = await rt('telemetry');
    await sprayHold(2.2);
    const after = await page.evaluate((uid) => {
      const l = window.__rt.game.loose.list.find((x) => x.part?.uid === uid);
      return l ? { paint: l.part.paint, t: l.part.paintMix?.t ?? null } : null;
    }, ram.uid);
    console.log('bumper', tel.target, JSON.stringify(after));
    if (!after || after.paint !== 23 || after.t !== null) fail(`the bumper lying about was not painted white (${JSON.stringify(after)})`);
    await rt('simulate', 0.1);
    await shot('loose');
  }

  // 9. the gun on the compressor: the whole car in the can's colour, from the can's paint
  const gun = await page.evaluate(() => !!window.__rt.game.devices.find((d) => d.id === 'paintbooth'));
  if (gun) {
    await rt('hold', 'tool:spray', { tier: 3, colour: 24 });
    const r = await rt('useDevice', 'paintbooth');
    await rt('simulate', 4.5);
    const all = await page.evaluate(() => {
      const b = window.__rt.game.vehicles[0].build;
      return { body: b.paint, parts: Object.entries(b.parts).filter(([, p]) => p.paint >= 0).map(([m, p]) => `${m}:${p.paint}${p.paintMix ? '~' : ''}`), left: window.__rt.game.player.held?.tool?.paint };
    });
    console.log('gun', JSON.stringify(r), JSON.stringify(all));
    if (all.body !== 24) fail(`the gun did not paint the body (${all.body})`);
    if (!all.parts.includes('door_FL:24') || !all.parts.includes('hood:24')) fail(`the gun did not paint the doors and the bonnet (${all.parts.join(',')})`);
    if (!(all.left < 100 - 15 && all.left > 100 - 30)) fail(`the gun did not use the can's paint for eleven things (${all.left} left)`);
    await rt('aim', 0, 'door_FL', 2.8);
    await rt('simulate', 0.1);
    await shot('gun');
  } else console.log('(no paint gun in this garage)');

  // 10. a coat left half-done, saved and read back
  await rt('hold', 'tool:spray', { tier: 2, colour: 9 });
  await rt('aim', 0, 'hood', 1.4);
  await sprayHold(1.2);
  const hood = await paintOf('hood');
  await page.evaluate(() => window.__rt.game.save());
  await page.waitForTimeout(800);
  await page.goto(`${url}/modcar.html`, { waitUntil: 'domcontentloaded' });
  await ready();
  await rt('simulate', 0.4);
  const hoodBack = await paintOf('hood');
  console.log('read back', JSON.stringify({ hood, hoodBack }));
  if (hoodBack.paint !== 9 || hoodBack.t === null || Math.abs(hoodBack.t - hood.t) > 1e-6) fail(`the half-done bonnet came back otherwise (${JSON.stringify(hood)} → ${JSON.stringify(hoodBack)})`);
  if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
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
console.log(bad ? `modcar_paint: ${bad} FAILED` : 'paint ok');
process.exit(bad ? 1 : 0);
