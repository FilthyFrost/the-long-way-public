// The controls with the real mouse and the real keyboard (docs/V3/plan/finish.md §十八, 界面恢复) — every other
// walkthrough sets the game's buttons from the script, so none of them could see a button the game is never told of.
// Here the page's own mouse and keys do it, as a player's do:
//  1. on foot in the workshop: the first click takes the mouse; one click takes up a part lying about; a shut bonnet
//     over the battery's place is opened by a click on its ghost and the battery fitted with the left button held; a
//     seat fitted from beside the driver's door the same way; the battery taken off again with the hands empty; Q puts
//     it down;
//  2. Tab opens the lists, Tab shuts them; D on to the pages, Esc shuts them; J opens the recipe book and J shuts it;
//     F1 the help in its three parts (鼠标, 键盘, 开车) and F1 again away; the dial top left and its three tiles;
//  3. the bench: a click opens it, its footer W S · Enter · Esc / E, S and W pick, Esc and E shut it;
//  4. in the driver's seat: the card with 车灯 and 喇叭; L switches the lamps, H held sounds the horn, V the view and
//     back; the readings in the corner of the screen; the engine off and tired, the right button held: asleep.
//   SHOTS_GPU=1 node harness/shots/ui_controls.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, launchBrowser, openGame, startServer } from './lib.mjs';

const out = path.join(ROOT, 'loop/shots/ui_controls');
fs.mkdirSync(out, { recursive: true });
const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const ok = (cond, why) => (cond ? console.log('ok  ', why) : fail(why));

/** the helpers on one page: the script's hooks place the player and read the game; the page's mouse and keys act */
function on(page) {
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const step = (s) => ev((s) => { const g = window.__rt.game; for (let t = 0; t < s; t += 1 / 60) g.step(1 / 60, 1); g.simulate(0); }, s);
  const shot = async (f) => {
    await ev(() => window.__rt.render());
    await page.screenshot({ path: path.join(out, f) });
  };
  const target = () => ev(() => { const t = window.__rt.game.player.target; return t ? `${t.kind}:${t.mount?.id ?? t.uid ?? t.device?.id ?? ''}` : ''; });
  const held = () => ev(() => { const h = window.__rt.game.player.held; return h ? (h.kind === 'part' ? h.inst.part : h.kind) : ''; });
  const click = async (button = 'left') => {
    await page.mouse.down({ button });
    await step(0.1);
    await page.mouse.up({ button });
    await step(0.4);
  };
  /** the button held until `done` (or `max` s); how long it took */
  const hold = async (done, max = 4, button = 'left') => {
    await page.mouse.down({ button });
    let s = 0;
    for (; s < max; s += 0.25) {
      await step(0.25);
      if (await done()) break;
    }
    await page.mouse.up({ button });
    await step(0.3);
    return s;
  };
  const key = async (code, s = 0.1) => {
    await page.keyboard.down(code);
    await step(s);
    await page.keyboard.up(code);
    await step(0.3);
  };
  /** a mount's ghost's middle, with the vehicle's axes (the part must be in the hands) */
  const ghost = async (m) => {
    for (let k = 0; k < 40; k++) {
      if (k % 10 === 0) await rt('aim', 0, m, 1.6, 0);
      else await page.waitForTimeout(50);
      const c = await ev((m) => {
        const g = window.__rt.game; const v = g.vehicles[0]; g.simulate(0);
        const c = g.player.ghosts.centerOf(`${v.build.uid}:${m}:`); if (!c) return null;
        const o = g.core.origin; const b = new Float64Array(9); v.sim.basis(b);
        return { x: c.x + o.x, y: c.y + o.y, z: c.z + o.z, fx: b[0], fz: b[2], lx: b[6], lz: b[8], side: v.view.frame.mounts.find((x) => x.id === m)?.side ?? 0 };
      }, m);
      if (c) return c;
    }
    return null;
  };
  /** stand `lat` m out to its side (or `fwd` m before it) and look at a point */
  const lookAt = (c, lat, fwd = 0) => {
    const s = c.side || 1;
    const px = c.x + c.lx * lat * s + c.fx * fwd;
    const pz = c.z + c.lz * lat * s + c.fz * fwd;
    return rt('aimPoint', c.x, c.y, c.z, Math.atan2(pz - c.z, px - c.x), Math.hypot(px - c.x, pz - c.z));
  };
  const fitted = (m) => ev((m) => !!window.__rt.game.vehicles[0].build.parts[m], m);
  return { rt, ev, step, shot, target, held, click, hold, key, ghost, lookAt, fitted };
}

try {
  // ---------------------------------------------------------------- 1–3. on foot in the workshop
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&kit=j5&time=10&world=1&seed=7`, { width: 1280, height: 720 });
    const P = on(page);
    await page.mouse.move(640, 360);
    await page.mouse.click(640, 360);
    await P.step(0.4);
    ok(await P.ev(() => window.__rt.game.input.locked), 'the first click takes the mouse');

    // one click takes up a part lying about
    const lie = await P.ev(() => { const g = window.__rt.game; const l = g.loose.list.find((x) => x.part?.part === 'bat_std'); return l ? { uid: l.uid, x: l.x, y: l.y + (l.mid ?? 0.1), z: l.z } : null; });
    let m = '';
    for (const turn of [0, 0.8, -0.8, Math.PI, 1.6, -1.6]) {
      m = await P.rt('aimPoint', lie.x, lie.y, lie.z, turn, 1.2);
      if (m === `loose:${lie.uid}`) break;
    }
    await P.click();
    ok((await P.held()) === 'bat_std', `one click on the battery lying there takes it up (the mark was on ${m})`);

    // a shut bonnet over its place: a click on its ghost opens the bonnet, the button held fits it
    await P.rt('fit', 0, 'hood', 'hood_stock');
    await P.rt('openPanel', 0, 'hood', false);
    await P.step(0.3);
    const bat = await P.ghost('battery');
    if (bat) {
      await P.lookAt(bat, 0, 1.4);
      await P.step(0.2);
      const t0 = await P.target();
      await P.click();
      const open = await P.ev(() => window.__rt.game.vehicles[0].view.panelOpen('hood'));
      ok(t0 === 'part:hood' && open > 0.9, `the battery's place under the shut bonnet: the mark is on the bonnet (${t0}), a click opens it (${open.toFixed(2)})`);
      await P.lookAt(bat, 0, 1.4);
      await P.step(0.2);
      const s = await P.hold(() => P.fitted('battery'), 3);
      ok(await P.fitted('battery'), `the left button held on its ghost fits the battery (${s.toFixed(2)} s)`);
    } else fail('no ghost for the battery');
    await P.shot('01_battery.png');

    // the driver's seat from beside its door
    await P.rt('pickUp', 'seat_bucket');
    await P.step(0.3);
    const seat = await P.ghost('seat_driver');
    if (seat) {
      await P.lookAt(seat, 1.0);
      await P.step(0.2);
      const t1 = await P.target();
      const words = await P.ev(() => document.querySelector('.mc-bot')?.innerText.replace(/\s+/g, ' ') ?? '');
      await P.shot('02_seat_aimed.png');
      const s = await P.hold(() => P.fitted('seat_driver'), 3);
      ok(t1 === 'ghost:seat_driver' && words.includes('装上') && (await P.fitted('seat_driver')), `beside the driver's door, the seat's ghost under the mark (${t1}, "${words}"): the left button held fits it (${s.toFixed(2)} s)`);
    } else fail("no ghost for the driver's seat");
    // taken off with the hands empty: the battery, under the bonnet that is open now
    // (a fitted seat is not got at from outside: from beside its door the door's frame is under the mark and the button
    // held there gets one in — as it was on 11-24 too)
    {
      await P.ev(() => (window.__rt.game.player.held = null));
      const b = bat ?? (await P.ghost('battery'));
      let t2 = '';
      if (b) for (const fwd of [1.2, 1.0, 1.4]) {
        await P.lookAt(b, 0, fwd);
        await P.step(0.15);
        t2 = await P.target();
        if (t2 === 'part:battery') break;
      }
      const s2 = await P.hold(async () => !(await P.fitted('battery')), 3);
      ok(!(await P.fitted('battery')) && (await P.held()) === 'bat_std', `the hands empty, the mark on the battery (${t2}): the left button held takes it off (${s2.toFixed(2)} s)`);
      await P.key('KeyQ');
      ok((await P.held()) === '', 'Q puts it down');
    }

    // Tab: the lists; Tab again shuts them. Tab, D: the pages; Esc shuts them
    await P.key('Tab');
    const l1 = await P.ev(() => !!window.__rt.game.listV);
    await P.key('Tab');
    const l2 = await P.ev(() => !!window.__rt.game.listV);
    ok(l1 && !l2, `Tab opens what one has and what the car has (${l1}), Tab again shuts it (${!l2})`);
    await P.key('Tab');
    await P.key('KeyD');
    const p1 = await P.ev(() => window.__rt.game.tabPageOpen);
    await P.key('Escape');
    const p2 = await P.ev(() => window.__rt.game.tabPageOpen || !!window.__rt.game.listV);
    ok(p1 && !p2, `D turns on to the pages (${p1}), Esc shuts them (${!p2})`);
    // J: the recipe book, straight away; J again shuts it
    await P.key('KeyJ');
    const j1 = await P.ev(() => { const g = window.__rt.game; return g.tabPageOpen && g.tabPages[g.tabAt]?.id === 'recipes'; });
    await P.shot('03_book.png');
    await P.key('KeyJ');
    const j2 = await P.ev(() => window.__rt.game.tabPageOpen);
    ok(j1 && !j2, `J opens the recipe book (${j1}) and J shuts it (${!j2})`);
    // F1: the help in its three parts
    await P.key('F1');
    const help = await P.ev(() => { const e = document.querySelector('.mc-help'); return e && getComputedStyle(e).display !== 'none' ? e.innerText.replace(/\s+/g, ' ') : ''; });
    await P.shot('04_help.png');
    await P.key('F1');
    const help2 = await P.ev(() => { const e = document.querySelector('.mc-help'); return !!e && getComputedStyle(e).display !== 'none'; });
    ok(['鼠标', '键盘', '开车', '快捷栏', '食谱', '车灯', '喇叭', '睡觉'].every((w) => help.includes(w)) && !help2, `F1: the help in its three parts (${help.slice(0, 60)}…), F1 again away (${!help2})`);
    // the dial top left, its three tiles always there
    const dial = await P.ev(() => ({ dial: !!document.querySelector('.mc-vit .dial'), tiles: [...document.querySelectorAll('.mc-vit .tile')].map((t) => t.getAttribute('data-k')).join(','), bar: !!document.querySelector('.mc-vit .bar') }));
    ok(dial.dial && dial.tiles === 'food,water,energy' && !dial.bar, `top left the dial and its three tiles (${JSON.stringify(dial)})`);

    // the bench: the power on first (the generator's cord pulled, the left button held), then a click opens it; its
    // footer; S and W pick; Esc shuts it; again, E shuts it
    await P.rt('aimAt', 'gen_cord', 0, 1.0);
    await P.step(0.2);
    for (let pulls = 0; pulls < 6 && !(await P.rt('workshop')).power; pulls++) await P.hold(async () => false, 0.75);
    await P.step(1.5);
    ok((await P.rt('workshop')).power, 'the generator pulled into life with the left button held on its cord: the workshop has power');
    await P.ev(() => { const g = window.__rt.game; g.player.held = null; g.stock.scrap = 200; g.stock.components = 20; });
    const bench = async () => {
      await P.rt('aimAt', 'bench', Math.PI, 1.0);
      await P.step(0.2);
      await P.click();
      return P.ev(() => { const el = document.querySelector('.mc-craft'); return el && getComputedStyle(el).display !== 'none' ? { foot: el.querySelector('.ft')?.textContent ?? '', sel: el.querySelector('.row.sel')?.getAttribute('data-id') ?? '' } : null; });
    };
    const b1 = await bench();
    ok(!!b1 && b1.foot.includes('W') && b1.foot.includes('S') && b1.foot.includes('Enter') && b1.foot.includes('Esc') && b1.foot.includes('E 离开'), `a click on the bench opens it; its footer as on 11-24 (${b1?.foot})`);
    await P.shot('05_bench.png');
    await P.key('KeyS');
    await P.key('KeyW');
    const still = await P.ev(() => !!document.querySelector('.mc-craft') && getComputedStyle(document.querySelector('.mc-craft')).display !== 'none');
    await P.key('Escape');
    const shut1 = await P.ev(() => getComputedStyle(document.querySelector('.mc-craft')).display === 'none');
    // (the bench let the mouse go: a click takes it again, as a player's would)
    await P.click();
    const b2 = await bench();
    await P.key('KeyE');
    const shut2 = await P.ev(() => getComputedStyle(document.querySelector('.mc-craft')).display === 'none');
    ok(still && shut1 && !!b2 && shut2, `S and W pick in it (${still}); Esc shuts it (${shut1}); opened again, E shuts it (${shut2})`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }

  // ---------------------------------------------------------------- 4. in the driver's seat of a whole car on the road
  {
    const { page, errors } = await openGame(browser, `${url}/modcar.html?shot=1&world=5&seed=7&start=road&build=stock:sedan&s=600&time=10&weather=clear`, { width: 1280, height: 720 });
    const P = on(page);
    await page.mouse.move(640, 360);
    await page.mouse.click(640, 360);
    await P.step(0.5);
    await P.ev(() => { window.__rt.setView('cockpit'); });
    await P.step(0.3);
    const seated = await P.ev(() => !!window.__rt.game.seated);
    const card = await P.ev(() => [...document.querySelectorAll('.mc-keys div')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | '));
    ok(seated && card.includes('车灯') && card.includes('喇叭') && card.includes('换视角'), `in the seat; its card: ${card}`);
    const lamps0 = await P.ev(() => window.__rt.game.seated.sys.dash.lights);
    await P.key('KeyL');
    const lamps1 = await P.ev(() => window.__rt.game.seated.sys.dash.lights);
    ok(lamps1 !== lamps0, `L switches the lamps (${lamps0} → ${lamps1})`);
    await page.keyboard.down('KeyH');
    await P.step(0.3);
    const horn = await P.ev(() => window.__rt.game.seated.sys.horn);
    await page.keyboard.up('KeyH');
    await P.step(0.2);
    const horn2 = await P.ev(() => window.__rt.game.seated.sys.horn);
    ok(horn && !horn2, `H held sounds the horn (${horn}), let go it stops (${!horn2})`);
    await P.key('KeyV');
    const v1 = await P.ev(() => window.__rt.game.viewMode);
    await P.key('KeyV');
    const v2 = await P.ev(() => window.__rt.game.viewMode);
    ok(v1 === 'chase' && v2 === 'cockpit', `V: behind the car (${v1}) and back (${v2})`);
    const dash = await P.ev(() => ({ corner: !!document.querySelector('.mc-dash'), cluster: !!window.__rt.game.seated.view.cluster }));
    ok(!dash.corner && dash.cluster, `no readings in the corner of the screen, the cab's own instruments instead (${JSON.stringify(dash)})`);
    await P.shot('06_seat.png');
    // the engine off, standing, tired: the right button held — asleep
    await P.ev(() => {
      const g = window.__rt.game;
      const v = g.seated;
      if (v.sys.running) v.sys.stop('');
      v.sim.setParkBrake(true);
      g.player.held = null;
      g.body.energy = 30;
    });
    await P.step(1.5);
    const words = await P.ev(() => [...document.querySelectorAll('.mc-keys div')].map((e) => e.innerText.replace(/\s+/g, ' ')).join(' | '));
    await page.mouse.down({ button: 'right' });
    await P.step(1.3);
    const asleep = await P.ev(() => window.__rt.game.sleepT >= 0);
    await page.mouse.up({ button: 'right' });
    await P.step(4);
    const energy = await P.ev(() => window.__rt.game.body.energy);
    ok(words.includes('睡觉') && asleep && energy > 90, `the engine off and tired, the card says ${words.split(' | ').find((w) => w.includes('睡觉'))}; the right button held: asleep (${asleep}), rested (${energy.toFixed(0)})`);
    if (errors.length) fail(`page errors: ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `ui_controls: ${bad} failed` : 'ui_controls ok');
process.exit(bad ? 1 : 0);
