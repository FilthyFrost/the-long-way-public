// Foraging in the real game (docs/V3/nodes/W3-forage.md, node W3).
//
// A new game of version 2, kept: the starter kit — a knife and a basket — lies a step ahead in the workshop,
// and E takes the knife up. Off to a forest with the developer's teleport, out of the vehicle and into the
// wood: points show. The robot forager walks to the nearest one and picks it: a stack is in the hotbar, the
// point is remembered, the skill has its first experience. With the basket in the other slot the next picks
// go into it. With nothing known, a mushroom under the mark is "an unknown mushroom" in the prompt and on its
// card, and so is a fly agaric in the hand; eating it names it and makes one sick. The game is saved and
// opened again: the picked points are still picked, the basket holds what it held, what was learnt is known.
// Three game days on (the hour hand turned by the developer's clock) the picked points whose kinds regrow in
// three days bear again and the table has let go of them.
//
// On a page that is stepped by hand (shot=1): at a sea shore of the lake country the clam beds do not show at
// high tide and show at low tide (the tide is the world clock's: the hour hand is turned to it). Pictures of
// the ground plants, close, in several regions by day and of the glowing mushrooms by night, go into
// loop/shots/v3_forage/, and a sheet of every ground plant set out on the road — for looking at, drawn by the
// software renderer.
//
// A world of version 1 (what the sixteen older scripts run in) has no forage at all: no kit in the yard, no
// point anywhere, nothing found.
//
// Nothing here waits on the wall clock for a result: the game is stepped, or its own state is waited for.
//   SHOTS_GL=llvmpipe node harness/shots/v3_forage.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer, waitFrames } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/v3_forage');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const SAVE = 'modcar.save.v1';

/** the test hook's functions by name, and the harness functions of a system */
const hook = (page) => (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
const harness = (page) => (system, name, ...args) => page.evaluate(({ system, name, args }) => window.__rt.game.systems.harness(system, name, ...args), { system, name, args });

/** step the game until the world round the vehicle is built (the vehicle held where it stands); false when it never is */
async function built(page) {
  for (let round = 0; round < 12; round++) {
    const pending = await page.evaluate(() => {
      const g = window.__rt.game;
      g.scripted = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
      for (let i = 0; i < 40; i++) {
        g.simulate(0.1);
        if (i > 4 && window.__rt.worldPending() === 0) break;
      }
      g.simulate(0.3);
      g.scripted = null;
      return window.__rt.worldPending();
    });
    if (pending === 0) return true;
  }
  return false;
}

/** a place `off` metres to the side of the road (+ right, − left), `ahead` metres on from where the vehicle stands */
const beside = (page, ahead, off) =>
  page.evaluate(
    async ({ ahead, off }) => {
      const g = window.__rt.game;
      const v = g.seated ?? g.focus ?? g.vehicles[0];
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const pr = { s: 0, d: 0 };
      g.world.spine.project(v.sim.px, v.sim.pz, NaN, pr);
      const st = new SpineSample();
      g.world.spine.at(pr.s + ahead, st);
      return { s: pr.s + ahead, x: st.x - Math.sin(st.phi) * off, z: st.z + Math.cos(st.phi) * off, phi: st.phi };
    },
    { ahead, off },
  );

/** out of the vehicle, to a place in the country, and the game stepped until the look-out has taken its look */
async function standAt(page, x, z, heading = 0) {
  await hook(page)('stand', x, z, heading, -0.15);
  await hook(page)('simulate', 4);
}

/** the hands: what is in each slot, and in what is in it */
const hands = (page) =>
  page.evaluate(() => {
    const p = window.__rt.game.player;
    return p.slots.map((h) => (h?.kind === 'item' ? { item: h.item.item, n: h.item.n ?? 1, q: h.item.q ?? 0, inside: (h.item.inside ?? []).map((x) => `${x.item}*${x.n ?? 1}`) } : h ? { item: h.kind, n: 1, q: 0, inside: [] } : null));
  });

/** the words on screen: the prompt over the hotbar, the card of what the mark is on, the card of the thing in the hand, the toast, the hotbar's counts */
const words = (page) =>
  page.evaluate(() => {
    const shown = (sel) => {
      const e = document.querySelector(sel);
      return !!e && e.style.display !== 'none' && e.style.opacity !== '0';
    };
    const text = (sel) => (shown(sel) ? document.querySelector(sel).textContent : '');
    return {
      acts: text('.mc-acts'),
      aim: shown('.mc-ic.aim') ? document.querySelector('.mc-ic.aim .nm')?.textContent ?? '' : '',
      aimText: text('.mc-ic.aim'),
      held: shown('.mc-ic.held') ? document.querySelector('.mc-ic.held .nm')?.textContent ?? '' : '',
      heldText: text('.mc-ic.held'),
      toast: document.querySelector('.mc-toast')?.textContent ?? '',
      counts: [...document.querySelectorAll('.mc-hot .s .c')].map((e) => e.textContent),
      titles: [...document.querySelectorAll('.mc-hot .s')].map((e) => e.getAttribute('title')),
    };
  });

/** the robot forager set going where one stands, and the game stepped until it is done; what it did */
async function robot(page, radius, most) {
  const hx = harness(page);
  if (!(await hx('forage', 'robot', radius, most))) return null;
  let report = null;
  for (let i = 0; i < 120; i++) {
    report = await page.evaluate(() => {
      window.__rt.game.simulate(1);
      return window.__rt.game.systems.harness('forage', 'robotReport');
    });
    if (!report.on) break;
  }
  await hx('forage', 'robotStop');
  return report;
}

/** the hour hand turned on by so many game hours (the world's clock follows it forward) */
async function hoursOn(page, hours) {
  for (let left = hours; left > 1e-6; ) {
    const step = Math.min(left, 11);
    left -= step;
    await page.evaluate((step) => {
      const g = window.__rt.game;
      window.__rt.setHour((g.clock.hour + step) % 24);
    }, step);
  }
}

/** a picture with the camera put by hand: `back` metres from a point towards `from` (an angle on the plan), `up` metres over its ground, looking at it */
async function closeUp(page, p, name, back = 1.3, up = 1.0, from = 0.6) {
  await page.evaluate(
    ({ p, back, up, from }) => {
      const g = window.__rt.game;
      const o = g.core.origin;
      const c = g.core.camera;
      c.position.set(p.x + Math.cos(from) * back - o.x, p.y + up - o.y, p.z + Math.sin(from) * back - o.z);
      c.lookAt(p.x - o.x, p.y + 0.12 - o.y, p.z - o.z);
      c.updateMatrixWorld(true);
      g.render();
    },
    { p, back, up, from },
  );
  await page.screenshot({ path: path.join(out, `${name}.png`) });
}

try {
  // ------------------------------------------------------------------ a new game of version 2, kept
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    const rt = hook(page);
    const hx = harness(page);
    const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180000 });
    await page.goto(`${url}/modcar.html?world=2`, { waitUntil: 'domcontentloaded' });
    await ready();
    await page.evaluate(() => window.__rt.game.ui.showHelp(false));
    const game = await page.evaluate(() => ({ version: window.__rt.game.world?.rules.version ?? window.__rt.params.world, keep: window.__rt.params.keep, modules: window.__rt.kernel().modules, tabs: window.__rt.kernel().devTabs }));
    console.log('new game', JSON.stringify(game));
    if (game.version !== 2 || !game.keep) fail(`not a kept game of version 2: ${JSON.stringify(game)}`);
    for (const m of ['forage', 'progress']) if (!game.modules.includes(m) || !game.tabs.includes(m)) fail(`the module ${m} or its tab is not in the game`);

    // the kit: a knife and a basket a step ahead of where the game begins
    await rt('simulate', 2);
    const kit = await page.evaluate(() => {
      const g = window.__rt.game;
      const w = g.player.walker;
      return { lying: g.loose.list.filter((l) => l.item?.item.startsWith('forage_')).map((l) => ({ item: l.item.item, dist: Math.hypot(l.x - w.x, l.z - w.z), resting: l.resting, y: l.y - w.y })), slice: g.systems.harness('forage', 'slice') };
    });
    console.log('the kit', JSON.stringify(kit));
    if (kit.lying.map((l) => l.item).sort().join() !== 'forage_basket,forage_knife') fail(`the kit does not lie in the yard: ${JSON.stringify(kit.lying)}`);
    if (kit.lying.some((l) => l.dist > 2.5 || !l.resting || Math.abs(l.y) > 1)) fail(`the kit does not lie at rest a step ahead: ${JSON.stringify(kit.lying)}`);
    if (kit.slice?.kit !== true) fail(`the slice does not say the kit was given: ${JSON.stringify(kit.slice)}`);
    // (looking well down: the two lie above the middle of the picture, clear of the words that stand there)
    await rt('look', await page.evaluate(() => window.__rt.game.player.walker.heading), -0.9);
    await waitFrames(page, 2);
    await page.screenshot({ path: path.join(out, 'kit.png') });
    // E takes the knife up
    const onKnife = await rt('aimLoose', 'item:forage_knife', 1.0);
    await rt('press');
    const withKnife = await hands(page);
    console.log('the knife', onKnife, JSON.stringify(withKnife));
    if (!withKnife.some((h) => h?.item === 'forage_knife')) fail(`E did not take the knife up: ${JSON.stringify(withKnife)}`);

    // off to a forest, in the pickup
    await rt('enter', 1);
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.seated.sys.startNow();
      g.seated.sim.setParkBrake(true);
    });
    const went = await rt('devGoRegion', 'forest', true);
    if (!went.startsWith('森林：')) fail(`the panel did not go to a forest: ${went}`);
    if (!(await built(page))) fail('the world round the vehicle was never built after the teleport');
    // while one sits at a standstill the look-out looks too; out of the vehicle and into the wood
    let spot = null;
    let shown = [];
    for (const [ahead, off] of [[60, -40], [60, 40], [200, -45], [200, 45], [400, -45]]) {
      spot = await beside(page, ahead, off);
      await standAt(page, spot.x, spot.z, spot.phi);
      shown = await hx('forage', 'shown');
      if (shown.filter((p) => p.dist < 45 && p.layer === 'ground').length >= 6) break;
    }
    const tele = (await rt('kernel')).systems.forage;
    console.log('in the forest', went, `· ${shown.length} points show:`, [...new Set(shown.map((p) => p.kind))].join(' '), JSON.stringify(tele.own));
    if (shown.length < 8) fail(`only ${shown.length} points show in the forest`);
    if (!shown.some((p) => p.layer === 'ground') || !shown.some((p) => p.layer !== 'ground')) fail('the points are not of the ground and of bushes or trees both');
    if (tele.failed || tele.errors) fail(`the forage system is not well: ${JSON.stringify(tele)}`);
    await waitFrames(page, 2);
    await page.screenshot({ path: path.join(out, 'forest.png') });

    // the robot walks to the nearest point and picks it: a stack in the hotbar
    const picks = [];
    await page.evaluate(() => {
      window.__picks = [];
      window.__rt.game.events.on('forage:picked', (e) => window.__picks.push({ ...e }));
    });
    const first = await robot(page, 60, 1);
    picks.push(...(await page.evaluate(() => window.__picks.splice(0))));
    const after1 = await hands(page);
    await waitFrames(page, 2);
    const w1 = await words(page);
    console.log('the first pick', JSON.stringify(first), JSON.stringify(picks), JSON.stringify(after1), JSON.stringify({ toast: w1.toast, counts: w1.counts, titles: w1.titles }));
    if (!first || first.picked !== 1 || picks.length !== 1) fail(`the robot did not pick one point: ${JSON.stringify(first)}`);
    const stack = after1.find((h) => h && h.item === picks[0]?.kind);
    if (!stack || stack.n !== picks[0].n || stack.q !== picks[0].q) fail(`the pick is not in the hotbar as a stack: ${JSON.stringify(after1)}`);
    if (picks[0] && picks[0].n > 1 && !w1.counts.includes(String(picks[0].n))) fail(`the hotbar does not show the stack's count ${picks[0]?.n}: ${JSON.stringify(w1.counts)}`);
    if ((await hx('forage', 'picked')) !== 1) fail('the point is not remembered as picked');
    if (!((await hx('progress', 'xp', 'forage')) > 0)) fail('the pick gave no experience');
    await page.screenshot({ path: path.join(out, 'picked.png') });

    // the basket in the other slot (where the knife was): the next picks go into it
    const knifeSlot = after1.findIndex((h) => h?.item === 'forage_knife');
    await rt('select', knifeSlot);
    await rt('hold', 'item:forage_basket');
    const more = await robot(page, 60, 5);
    picks.push(...(await page.evaluate(() => window.__picks.splice(0))));
    const after2 = await hands(page);
    const basket = after2.find((h) => h?.item === 'forage_basket');
    const lying = await page.evaluate((kinds) => window.__rt.game.loose.list.filter((l) => l.item && kinds.includes(l.item.item)).length, picks.map((p) => p.kind));
    console.log('with the basket', JSON.stringify(more), JSON.stringify(after2));
    if (!more || more.picked < 3) fail(`the robot picked only ${more?.picked} more points`);
    if (!basket || basket.inside.length === 0) fail(`nothing went into the basket: ${JSON.stringify(after2)}`);
    const total = picks.reduce((a, p) => a + p.n, 0);
    const held = after2.reduce((a, h) => a + (h && h.item !== 'forage_basket' && h.item !== 'forage_knife' ? h.n : 0), 0) + (basket ? basket.inside.reduce((a, t) => a + Number(t.split('*')[1]), 0) : 0);
    if (held !== total) fail(`${total} portions were picked, ${held} are in the hands and the basket (lying about: ${lying})`);
    console.log(`the robot: ${first.seconds.toFixed(1)} game seconds for the first point, ${more.seconds.toFixed(1)} for the next ${more.picked} (${more.perPoint.toFixed(1)} a point, ${more.walked.toFixed(0)} m walked)`);

    // nothing known: a mushroom under the mark is an unknown mushroom, in the prompt and on its card
    await hx('progress', 'setLevel', 'forage', 1);
    await hx('progress', 'forgetAll', 'forage');
    const mushrooms = await page.evaluate(async () => {
      const { FORAGE_KINDS } = await import('/src/core/v3/forage/kinds.ts');
      return FORAGE_KINDS.filter((k) => k.cat === 'mushroom').map((k) => k.id);
    });
    await rt('simulate', 1);
    let mushroom = (await hx('forage', 'shown')).find((p) => p.layer === 'ground' && mushrooms.includes(p.kind));
    if (!mushroom) {
      // (none shows by this light: after rain more of them do)
      await hx('forage', 'rain', true);
      await hx('forage', 'rain', false);
      await rt('simulate', 1);
      mushroom = (await hx('forage', 'shown')).find((p) => p.layer === 'ground' && mushrooms.includes(p.kind));
    }
    if (!mushroom) fail('no mushroom shows anywhere near');
    else {
      const on = await rt('aimPoint', mushroom.x, mushroom.aimY, mushroom.z, 0.4, 1.1);
      await waitFrames(page, 3);
      const w = await words(page);
      console.log('a mushroom under the mark', mushroom.kind, on, JSON.stringify({ acts: w.acts, aim: w.aim, aimText: w.aimText }));
      if (on !== `device:forage:${mushroom.key}`) fail(`the mark is not on the mushroom: ${on}`);
      if (!w.acts.includes('采') || !w.acts.includes('不认识的蘑菇')) fail(`the prompt does not veil the mushroom: "${w.acts}"`);
      if (w.aim !== '不认识的蘑菇' || !w.aimText.includes('还不认识')) fail(`the card does not veil the mushroom: "${w.aim}" / "${w.aimText}"`);
      await page.screenshot({ path: path.join(out, 'veiled.png') });
    }

    // a fly agaric in the hand is an unknown mushroom; eaten, it has a name, and one is sick
    const stackSlot = (await hands(page)).findIndex((h) => h && h.item !== 'forage_basket');
    await rt('select', stackSlot >= 0 ? stackSlot : 1);
    await rt('hold', 'item:fly_agaric');
    await waitFrames(page, 3);
    const inHand = await words(page);
    const before = await page.evaluate(() => ({ hp: window.__rt.game.body.hp, veil: window.__rt.game.systems.harness('forage', 'veil', 'fly_agaric') }));
    // (the card of the thing in the hand: its veiled name, and nothing that gives it away)
    if (inHand.held !== '不认识的蘑菇' || inHand.heldText.includes('毒蝇伞') || inHand.heldText.includes('闹肚子')) fail(`the fly agaric in the hand is not veiled: "${inHand.held}" / "${inHand.heldText}"`);
    if (!inHand.titles.includes('不认识的蘑菇')) fail(`the hotbar names the fly agaric: ${JSON.stringify(inHand.titles)}`);
    if (before.veil.state !== 1) fail(`the fly agaric is not unknown before it is eaten: ${JSON.stringify(before.veil)}`);
    // (eaten with the right button since docs/V3/plan/growth.md J1: one press, the bites go on by themselves)
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.rightButton = true;
      for (let i = 0; i < 4; i++) g.step(1 / 60, 1);
      g.rightButton = false;
      for (let t = 0; t < 3.2; t += 1 / 60) g.step(1 / 60, 1);
    });
    const tasted = await page.evaluate(() => {
      const g = window.__rt.game;
      const out = { veil: g.systems.harness('forage', 'veil', 'fly_agaric'), sick: g.body.effects.sick1 ?? 0, known: g.systems.harness('progress', 'knowledge', 'forage', 'fly_agaric'), toast: '' };
      // (the line that says what was tasted waits its turn behind whatever line is still up: one at a time)
      for (let i = 0; i < 40 && !out.toast.includes('尝出来了'); i++) {
        g.simulate(0.25);
        out.toast = document.querySelector('.mc-toast')?.textContent ?? '';
      }
      return out;
    });
    // (J6: being ill takes its toll a little at a time — docs/V3/plan/growth.md §四: a minute of it)
    await rt('simulate', 62);
    const hpAfter = await page.evaluate(() => window.__rt.game.body.hp);
    console.log('the fly agaric', JSON.stringify(inHand.held), '->', JSON.stringify(tasted), `health ${before.hp.toFixed(1)} -> ${hpAfter.toFixed(1)}`);
    if (tasted.veil.state !== 0 || tasted.veil.name !== '毒蝇伞' || tasted.known !== 2) fail(`eating the fly agaric did not name it: ${JSON.stringify(tasted)}`);
    if (!tasted.toast.includes('尝出来了') || !tasted.toast.includes('毒蝇伞')) fail(`no line says what was tasted: "${tasted.toast}"`);
    if (!(tasted.sick > 0)) fail('the fly agaric did not make one sick');
    if (!(before.hp - hpAfter >= 2)) fail(`the fly agaric did not hurt (${before.hp} -> ${hpAfter})`);

    // saved, opened again: the picked points stay picked, the basket holds what it held, what was learnt is known
    const kept = await page.evaluate(() => {
      const g = window.__rt.game;
      g.save();
      return { picked: g.systems.harness('forage', 'picked'), xp: g.systems.harness('progress', 'xp', 'forage'), day: g.clock.day, hour: g.clock.hour };
    });
    const handsBefore = await hands(page);
    const stored = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), SAVE));
    console.log('saved', JSON.stringify({ forage: stored.slices?.forage, progress: `${JSON.stringify(stored.slices?.progress ?? null).length} bytes` }), JSON.stringify(kept));
    if (!stored.slices?.forage || stored.slices.forage.d.p.length !== picks.length * 2 || stored.slices.forage.d.kit !== true) fail(`the save's forage slice is not what was picked: ${JSON.stringify(stored.slices?.forage)}`);
    if (kept.picked !== picks.length) fail(`${picks.length} points were picked, ${kept.picked} are remembered`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready();
    await page.evaluate(() => window.__rt.game.ui.showHelp(false));
    await rt('simulate', 5);
    const back = await page.evaluate(() => {
      const g = window.__rt.game;
      return { picked: g.systems.harness('forage', 'picked'), xp: g.systems.harness('progress', 'xp', 'forage'), veil: g.systems.harness('forage', 'veil', 'fly_agaric'), shown: g.systems.harness('forage', 'shown').map((p) => p.key), kitLying: g.loose.list.filter((l) => l.item?.item === 'forage_knife' || l.item?.item === 'forage_basket').length, version: g.world.rules.version, last: window.__rt.lastError };
    });
    const handsBack = await hands(page);
    console.log('opened again', JSON.stringify({ ...back, shown: back.shown.length }), JSON.stringify(handsBack));
    if (back.version !== 2) fail(`the game opened again is of version ${back.version}`);
    if (back.picked !== picks.length) fail(`after the reload ${back.picked} points are remembered, ${picks.length} were picked`);
    if (picks.some((p) => back.shown.includes(p.key))) fail('a picked point shows again right after the reload');
    if (back.shown.length === 0) fail('nothing shows after the reload');
    if (JSON.stringify(handsBack) !== JSON.stringify(handsBefore)) fail(`the hands and the basket are not as they were saved: ${JSON.stringify(handsBack)} against ${JSON.stringify(handsBefore)}`);
    if (back.veil.state !== 0 || back.xp !== kept.xp) fail(`what was learnt is not back: ${JSON.stringify(back.veil)}, experience ${back.xp} against ${kept.xp}`);
    if (back.last) fail(`an error after the reload: ${back.last}`);

    // three game days on: the points whose kinds regrow in three days bear again
    const regrow = await page.evaluate(async (kinds) => {
      const { forageKind } = await import('/src/core/v3/forage/kinds.ts');
      return Object.fromEntries(kinds.map((k) => [k, { days: forageKind(k).regrowDays, when: !!forageKind(k).when }]));
    }, [...new Set(picks.map((p) => p.kind))]);
    await hoursOn(page, 72);
    await rt('simulate', 5);
    const later = await page.evaluate(() => {
      const g = window.__rt.game;
      return { day: g.clock.day, picked: g.systems.harness('forage', 'picked'), shown: g.systems.harness('forage', 'shown').map((p) => p.key), slice: g.systems.harness('forage', 'slice') };
    });
    const due = picks.filter((p) => regrow[p.kind].days <= 3);
    const notYet = picks.filter((p) => regrow[p.kind].days > 3);
    console.log(`three days on (day ${kept.day} -> ${later.day})`, JSON.stringify(regrow), `· ${due.length} due, ${notYet.length} not yet · remembered ${later.picked}`);
    if (later.day - kept.day !== 3) fail(`the clock went on by ${later.day - kept.day} days, not three`);
    if (due.length === 0) fail('none of the picked kinds regrows within three days: nothing to see');
    for (const p of due) if (!regrow[p.kind].when && !later.shown.includes(p.key)) fail(`the ${p.kind} picked three days ago does not bear again`);
    for (const p of notYet) if (later.shown.includes(p.key)) fail(`the ${p.kind} bears again after three days, its kind takes ${regrow[p.kind].days}`);
    if (later.picked !== notYet.length) fail(`${later.picked} points are still remembered, ${notYet.length} are still regrowing`);
    if (later.slice.p.length !== notYet.length * 2) fail(`the slice still holds ${later.slice.p.length / 2} points`);
    const k = await rt('kernel');
    console.log('the forage system in the live game', JSON.stringify({ ms: k.systems.forage.ms.total, budget: k.systems.forage.budgetMs, over: k.systems.forage.over, errors: k.errors }));
    if (k.lastError) fail(`the kernel set something apart: ${k.lastError}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.evaluate((key) => ((window.__rt.game.saveOff = true), localStorage.removeItem(key)), SAVE);
    await ctx.close();
  }

  // ------------------------------------------------------------------ stepped by hand: the tide at a sea shore, and the pictures
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=2&start=road&build=stock:pickup&s=300&time=13&weather=clear`, { width: 1280, height: 720 });
    const rt = hook(page);
    const hx = harness(page);
    await page.evaluate(() => (window.__rt.game.ui.root.style.visibility = 'hidden'));
    // (a game that begins on the road is a test drive: no kit)
    await rt('stand', ...(await beside(page, 10, 6).then((b) => [b.x, b.z, b.phi])));
    await rt('simulate', 1);
    if (await page.evaluate(() => window.__rt.game.loose.list.some((l) => l.item?.item.startsWith('forage_')))) fail('a kit was given in a game that begins on the road');

    // the developer's two tabs: every kind within a click, a skill's level set
    if ((await rt('devTab', 'forage')) !== 'forage') fail('the 采集 tab did not open');
    const tab = await page.evaluate(() => {
      const pane = document.querySelector('.mc-dev .pane[data-p="forage"]');
      const buttons = [...pane.querySelectorAll('.btns button')];
      const press = (label) => buttons.find((b) => b.textContent === label)?.click();
      // (the berries' name since d1ccb8b)
      press('野生黑莓');
      press('松露');
      const g = window.__rt.game;
      return { buttons: buttons.length, headings: pane.querySelectorAll('h5').length, status: pane.querySelector('.where')?.textContent ?? '', msg: pane.querySelector('.msg')?.textContent ?? '', hands: g.player.slots.map((h) => (h?.kind === 'item' ? `${h.item.item}*${h.item.n ?? 1}` : null)), known: g.systems.harness('forage', 'veil', 'truffle') };
    });
    console.log('the 采集 tab', JSON.stringify(tab));
    if (tab.buttons < 80 + 4 + 10 + 5 || tab.headings < 14) fail(`the 采集 tab is not all there: ${tab.buttons} buttons under ${tab.headings} headings`);
    if (!tab.hands.includes('wild_berry*10') || !tab.hands.includes('truffle*8') || tab.known.state !== 0) fail(`the tab's grid did not hand out full stacks, known: ${JSON.stringify(tab)}`);
    if ((await rt('devTab', 'progress')) !== 'progress') fail('the 成长 tab did not open');
    const grown = await page.evaluate(() => {
      const pane = document.querySelector('.mc-dev .pane[data-p="progress"]');
      [...pane.querySelectorAll('.btns button')].find((b) => b.textContent === '5 级')?.click();
      const g = window.__rt.game;
      return { level: g.systems.harness('progress', 'level', 'forage'), perk: g.systems.harness('progress', 'hasPerk', 'forage_glow'), box: pane.querySelector('.where')?.textContent ?? '' };
    });
    console.log('the 成长 tab', JSON.stringify(grown));
    if (grown.level !== 5 || !grown.perk) fail(`the 成长 tab did not set the level: ${JSON.stringify(grown)}`);
    await page.evaluate(() => {
      const g = window.__rt.game;
      g.toggleDev(false);
      for (let i = 0; i < g.player.slots.length; i++) g.player.slots[i] = null;
      g.systems.harness('progress', 'setLevel', 'forage', 1);
      g.systems.harness('progress', 'forgetAll', 'forage');
    });
    await rt('enter', 0);

    // the lake country by the sea: the first of its chapters ahead that has a sea
    const coast = await page.evaluate(() => {
      const g = window.__rt.game;
      for (const c of window.__rt.devJourney(60)) {
        if (c.id !== 'lakes') continue;
        const sea = g.world.sea.seaOf(c.chapter);
        if (sea) return { chapter: c.chapter, s0: sea.s0, s1: sea.s1, side: sea.side };
      }
      return null;
    });
    if (!coast) fail('no chapter of the lake country by the sea in the next sixty regions');
    else {
      let clam = null;
      for (const f of [0.5, 0.35, 0.65, 0.25, 0.75]) {
        await rt('devGoKm', (coast.s0 + (coast.s1 - coast.s0) * f) / 1000, true);
        if (!(await built(page))) fail('the world at the sea was never built');
        const beds = await hx('forage', 'find', 'clam', 400, 5);
        if (beds.length) {
          clam = beds[0];
          break;
        }
      }
      if (!clam) fail('no clam bed within 400 m of the coast road');
      else {
        await standAt(page, clam.x + 3, clam.z, Math.PI);
        // high tide first: the hour hand turned to where the tide is high
        const tideNow = await hx('forage', 'tide');
        await hoursOn(page, tideNow.nextLowS / 3600 + 6.2);
        await rt('simulate', 2);
        const high = { tide: await hx('forage', 'tide'), shown: (await hx('forage', 'shown')).filter((p) => p.kind === 'clam').length, any: (await hx('forage', 'shown')).length };
        await hoursOn(page, high.tide.nextLowS / 3600 + 0.4);
        await rt('simulate', 2);
        const lowShown = await hx('forage', 'shown');
        const low = { tide: await hx('forage', 'tide'), shown: lowShown.filter((p) => p.kind === 'clam').length, kinds: [...new Set(lowShown.map((p) => p.kind))].join(' ') };
        console.log('the tide at a clam bed', JSON.stringify(coast), `· high ${high.tide.tide.toFixed(2)}: ${high.shown} clam beds of ${high.any} points · low ${low.tide.tide.toFixed(2)}: ${low.shown} clam beds (${low.kinds})`);
        if (!(high.tide.tide > -0.35) || high.shown !== 0) fail(`at high tide (${high.tide.tide.toFixed(2)}) ${high.shown} clam beds show`);
        if (!(low.tide.tide <= -0.35) || low.shown < 1 || !lowShown.some((p) => p.key === clam.key)) fail(`at low tide (${low.tide.tide.toFixed(2)}) the clam bed does not show (${low.shown} do)`);
        // pictures of the strand at low tide, by day: the next low tide that falls in the middle of the day
        for (let i = 0; i < 4; i++) {
          await hoursOn(page, (await hx('forage', 'tide')).nextLowS / 3600 + 0.3);
          const hour = await page.evaluate(() => window.__rt.game.clock.hour);
          if (hour > 9 && hour < 16) break;
          await hoursOn(page, 5);
        }
        await rt('simulate', 2);
        const strand = (await hx('forage', 'shown')).filter((p) => p.layer === 'ground' && p.dist < 40);
        const bed = strand.find((p) => p.kind === 'clam') ?? strand[0];
        if (bed) {
          await rt('aimPoint', bed.x, bed.aimY, bed.z, 0.6, 2.2);
          await page.evaluate(() => window.__rt.render());
          await page.screenshot({ path: path.join(out, 'shore_eye.png') });
          await closeUp(page, bed, 'shore_close');
        }
      }
    }

    // pictures: the ground plants close by, in several regions, by day
    const pictured = [];
    for (const [region, want] of [['forest', ['porcini', 'chanterelle', 'oyster_mushroom', 'wild_garlic', 'burdock']], ['flower_fields', ['chamomile', 'calendula', 'echinacea', 'honeycomb', 'potato']], ['bamboo_sea', ['bamboo_shoot', 'bamboo_fungus', 'mint', 'perilla']], ['terraces', ['wild_tomato', 'chili', 'coriander', 'shepherds_purse', 'potato']]]) {
      const went = await rt('devGoRegion', region, true);
      if (!(await built(page))) fail(`${region}: the world round the vehicle was never built`);
      await rt('setHour', 13);
      let best = null;
      for (const [ahead, off] of [[60, -40], [60, 40], [260, -45], [260, 45]]) {
        const spot = await beside(page, ahead, off);
        await standAt(page, spot.x, spot.z, spot.phi);
        const near = (await hx('forage', 'shown')).filter((p) => p.layer === 'ground' && p.dist < 40);
        best = want.map((kind) => near.find((p) => p.kind === kind)).find(Boolean) ?? best ?? near[0] ?? null;
        if (best && want.includes(best.kind)) break;
      }
      console.log(`picture: ${region} (${went}) -> ${best ? `${best.kind} (${best.plant})` : 'no ground plant near'}`);
      if (!best) continue;
      pictured.push(region);
      await rt('aimPoint', best.x, best.aimY, best.z, 0.6, 2.0);
      await page.evaluate(() => window.__rt.render());
      await page.screenshot({ path: path.join(out, `${region}_eye.png`) });
      await closeUp(page, best, `${region}_close`);
      // by night, the glowing mushrooms of the forest
      if (region === 'forest') {
        await rt('setHour', 22.5);
        await rt('simulate', 2);
        const glow = (await hx('forage', 'find', 'glow_mushroom', 300, 3))[0];
        if (!glow) console.log('picture: no glowing mushrooms within 300 m');
        else {
          await standAt(page, glow.x + 2.4, glow.z + 1, Math.PI);
          const on = (await hx('forage', 'shown')).find((p) => p.key === glow.key);
          if (!on) fail('the glowing mushrooms do not show by night');
          else {
            await rt('aimPoint', on.x, on.aimY, on.z, 0.6, 2.0);
            await page.evaluate(() => window.__rt.render());
            await page.screenshot({ path: path.join(out, 'forest_night_eye.png') });
            await closeUp(page, on, 'forest_night_close', 1.1, 0.7);
          }
          // and by day they are not there
          await rt('setHour', 13);
          await rt('simulate', 2);
          if ((await hx('forage', 'shown')).some((p) => p.key === glow.key)) fail('the glowing mushrooms show by day');
        }
        await rt('enter', 0);
      }
    }
    if (pictured.length < 3) fail(`ground plants were pictured in ${pictured.length} regions only`);

    // a sheet of the models: every ground plant one picks, set out on the road five abreast, pictured three
    // rows at a time from behind and above (the batch written by hand, and drawn before the game steps again)
    await rt('enter', 0);
    await rt('devGoRegion', 'plains', true);
    await built(page);
    await rt('setHour', 13);
    const sheet = await page.evaluate(async () => {
      const g = window.__rt.game;
      const { forage } = await import('/src/game/modcar/v3/forage/index.ts');
      const { PLANTS } = await import('/src/core/world/plants.ts');
      const { FORAGE_INDEX } = await import('/src/core/v3/forage/kinds.ts');
      const { SpineSample } = await import('/src/core/world/spine.ts');
      const pr = { s: 0, d: 0 };
      g.world.spine.project(g.seated.sim.px, g.seated.sim.pz, NaN, pr);
      const plants = PLANTS.map((p, i) => ({ p, i })).filter((x) => x.p.layer === 'ground' && x.p.bears);
      plants.sort((a, b) => (a.p.model < b.p.model ? -1 : a.p.model > b.p.model ? 1 : 0));
      const st = new SpineSample();
      const pts = [];
      const aim = new Float32Array(plants.length);
      plants.forEach((x, k) => {
        g.world.spine.at(pr.s + 12 + Math.floor(k / 5) * 1.5, st);
        const off = ((k % 5) - 2) * 1.45;
        const px = st.x - Math.sin(st.phi) * off;
        const pz = st.z + Math.cos(st.phi) * off;
        pts.push({ key: k + 1, x: px, y: g.world.heightAt(px, pz), z: pz, kind: FORAGE_INDEX[x.p.bears.forage], plant: x.i, size: 1, yaw: 0.6 + k, vary: 0.5, hidden: false, on: true });
        aim[k] = pts[k].y + 0.3;
      });
      window.__sheet = { forage, pts, aim, s: pr.s };
      g.getOut();
      g.simulate(0);
      return { plants: plants.length, rows: Math.ceil(plants.length / 5), families: [...new Set(plants.map((x) => x.p.model))].length };
    });
    console.log('the sheet of the models', JSON.stringify(sheet));
    if (sheet.families !== 19) fail(`the ground plants that bear are of ${sheet.families} families of model, not nineteen`);
    for (let part = 0; part * 3 < sheet.rows; part++) {
      await page.evaluate(async (part) => {
        const g = window.__rt.game;
        const { SpineSample } = await import('/src/core/world/spine.ts');
        const S = window.__sheet;
        const st = new SpineSample();
        g.world.spine.at(S.s + 12 + (part * 3 + 1) * 1.5, st);
        // (one stands among the three rows pictured: plants grow in by how near one stands)
        g.player.walker.place(st.x, st.z, st.phi);
        g.simulate(0);
        const w = g.player.walker;
        const view = S.forage.view;
        view.update(0, null, w.x, w.y, w.z, 0.01, false);
        view.show(S.pts, S.pts.length, S.aim, { x: w.x, y: w.y, z: w.z });
        view.update(5, null, w.x, w.y, w.z, 0.01, false);
        const o = g.core.origin;
        const c = g.core.camera;
        const y = g.world.heightAt(st.x, st.z);
        c.position.set(st.x - Math.cos(st.phi) * 4.6 - o.x, y + 3.1 - o.y, st.z - Math.sin(st.phi) * 4.6 - o.z);
        c.lookAt(st.x - o.x, y + 0.1 - o.y, st.z - o.z);
        c.updateMatrixWorld(true);
        g.render();
      }, part);
      await page.screenshot({ path: path.join(out, `sheet_${part}.png`) });
    }
    await rt('simulate', 1);
    // what the batch costs to draw, where one stands now
    const cost = await page.evaluate(() => {
      const g = window.__rt.game;
      const mesh = g.core.scene.getObjectByName('forage:plants');
      const before = g.core.stats;
      mesh.visible = false;
      g.render();
      const without = g.core.stats;
      mesh.visible = true;
      g.render();
      const withIt = g.core.stats;
      return { instances: mesh.count, calls: withIt.calls - without.calls, triangles: withIt.triangles - without.triangles, frame: before.calls };
    });
    console.log('the batch as drawn', JSON.stringify(cost));
    if (cost.calls > 3) fail(`foraging adds ${cost.calls} draw calls`);
    const last = await page.evaluate(() => window.__rt.lastError);
    if (last) fail(`an error on the stepped page: ${last}`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }

  // ------------------------------------------------------------------ a world of version 1 has no forage at all
  for (const [what, address] of [['in the yard', 'modcar.html?shot=1&world=1'], ['on the road', 'modcar.html?shot=1&world=1&start=road&build=stock:pickup&s=300']]) {
    const { page, errors } = await openGame(browser, `${url}/${address}`, { width: 960, height: 540 });
    const rt = hook(page);
    const hx = harness(page);
    await rt('simulate', 2);
    if (what === 'on the road') {
      // into the country of a forest, on foot
      await rt('devGoRegion', 'forest', true);
      await built(page);
      const spot = await beside(page, 60, -40);
      await standAt(page, spot.x, spot.z, spot.phi);
    }
    const seen = await page.evaluate(() => {
      const g = window.__rt.game;
      return { version: g.world?.rules.version ?? window.__rt.params.world, kit: g.loose.list.filter((l) => l.item?.item.startsWith('forage_')).length, shown: g.systems.harness('forage', 'shown').length, found: g.systems.harness('forage', 'find', '', 300).length, tele: window.__rt.kernel().systems.forage.own, slice: g.systems.harness('forage', 'slice'), last: window.__rt.lastError };
    });
    console.log(`version 1, ${what}`, JSON.stringify(seen));
    if (seen.version !== 1) fail(`the page ${what} is of version ${seen.version}`);
    if (seen.kit !== 0 || seen.shown !== 0 || seen.found !== 0 || seen.tele.found !== 0 || seen.tele.kit || seen.slice) fail(`a world of version 1 has forage ${what}: ${JSON.stringify(seen)}`);
    if (seen.last) fail(`an error ${what}: ${seen.last}`);
    if (errors.length) fail(`page errors ${what}: ${errors.slice(0, 3).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `${bad} failed` : 'v3 forage ok');
process.exit(bad ? 1 : 0);
