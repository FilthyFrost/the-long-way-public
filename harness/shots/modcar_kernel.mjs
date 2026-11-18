// The V3 kernel's seams in the real game (docs/V3/nodes/N0-foundation.md). The page is handed a probe module by
// this script (window.__rtModules, read by entry.ts, installed after the game's own modules) that uses every
// seam, and the game is asked what became of it. Nothing here depends on which modules the game itself has:
// the checks hold with none and with any.
//   0. without the probe: the game's modules are the folders under src/game/modcar/v3, nothing is reported, and
//      the developer's panel has its eight tabs, with a second row only when a module brings a tab;
//   A. on a test page: the probe is installed, its system set up after the vehicles are there, its three hooks
//      run once a step in order (twice with no seconds on simulate(0), and never with negative seconds), the
//      world's clock follows the hour and goes on to the next day when the hour is set back, the body's and the
//      clock's events are heard, a device from its source is found by the mark and worked with E (a press, a
//      hold), a device whose own code throws (its shape, its word, a press, a hold) is reported and passed over
//      while the step goes on, a hook that throws is the last error while the game goes on and each kind of
//      fault is written out once, its tab stands in the panel's second row and builds its content;
//   B. in the player's kept game: its slice and the clock are in the save and come back after a reload, a slice
//      of a system that is not there is kept untouched, a slice that hands out what cannot be written does not
//      keep the save from being written, a save the browser will not keep is said, a page on which the system
//      does not come up keeps what the save had of it, a save written while the clock waits is taken up without
//      a day gone by, a save from before slices loads as it did, and a new game starts everything again.
//   SHOTS_GL=llvmpipe node harness/shots/modcar_kernel.mjs
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser, ROOT, startServer } from './lib.mjs';

const { server, url } = await startServer();
const browser = await launchBrowser();
let bad = 0;
const fail = (why) => {
  bad++;
  console.log('FAIL', why);
};
const check = (ok, why) => {
  if (!ok) fail(why);
};
const close = (a, b, eps) => Math.abs(a - b) <= eps;
const EIGHT = 'parts,lab,proving,place,weather,time,look,terrain';
/** how many modules the game itself has: the folders under src/game/modcar/v3 with an index.ts */
const V3 = path.join(ROOT, 'src/game/modcar/v3');
const ownModules = fs.existsSync(V3) ? fs.readdirSync(V3, { withFileTypes: true }).filter((e) => e.isDirectory() && fs.existsSync(path.join(V3, e.name, 'index.ts'))).length : 0;

/** runs in the page before its own scripts: the probe module, and what it writes down (window.__probe) */
function probe() {
  const P = {
    setup: false, init: 0, pre: 0, step: 0, late: 0, disposed: false, order: [], dts: [],
    vehiclesAtInit: -1, readyAtInit: null, clockAtPre: -1, clockAtLate: -1,
    events: [], used: [], held: [], devices: [], throwIn: '', value: 0, restored: null, cleared: 0, ticks: 0, built: 0,
    hits: 0, stuck: 0, circle: false, hourAtInit: -1, skyAtInit: -1,
  };
  window.__probe = P;
  const device = (id, zh, more) => ({ id, x: 0, y: 0, z: 0, radius: 0.3, word: { zh, en: id }, state: { zh: '探针在这儿', en: 'the probe is here' }, use: () => P.used.push(id), ...more });
  P.button = device('probe:button', '按探针');
  P.lever = device('probe:lever', '拉探针', { holdS: 0.5, holding: (p) => P.held.push(p) });
  // devices whose own code throws: on a press, when asked for its shape, for its word, while E is held
  P.thrower = device('probe:thrower', '坏探针', {
    use: () => {
      P.used.push('probe:thrower');
      throw new Error('probe use');
    },
  });
  P.shapeless = device('probe:shapeless', '没形状的探针', {
    hit: () => {
      P.hits++;
      throw new Error('probe hit');
    },
  });
  P.wordless = {
    ...device('probe:wordless', ''),
    get word() {
      throw new Error('probe word');
    },
  };
  P.sticky = device('probe:sticky', '卡住的探针', {
    holdS: 0.5,
    holding: () => {
      P.stuck++;
      throw new Error('probe hold');
    },
  });
  const system = {
    id: 'probe',
    budget: { cpuMs: 0.5 },
    init(ctx) {
      P.init++;
      P.vehiclesAtInit = ctx.vehicles.length;
      P.readyAtInit = window.__rt ? window.__rt.ready : null;
      P.hourAtInit = ctx.clock.hour;
      P.skyAtInit = ctx.env.sky.hour;
      // (asked for by the script, once: a system whose set-up fails on this page and works on the next)
      let fail = false;
      try {
        fail = localStorage.getItem('probe.failInit') === '1';
        localStorage.removeItem('probe.failInit');
      } catch {
        // no storage: no failure asked for
      }
      if (fail) throw new Error('probe init');
    },
    preStep(dt, ctx) {
      P.pre++;
      P.order.push('pre');
      P.dts.push(dt);
      P.clockAtPre = ctx.clock.worldSeconds;
      if (P.throwIn === 'pre' || P.throwIn === 'both') throw new Error('probe pre');
    },
    step() {
      P.step++;
      P.order.push('step');
      if (P.throwIn === 'step' || P.throwIn === 'both') throw new Error('probe step');
    },
    lateUpdate(dt, ctx) {
      P.late++;
      P.order.push('late');
      P.clockAtLate = ctx.clock.worldSeconds;
    },
    dispose() {
      P.disposed = true;
    },
    telemetry: () => ({ value: P.value }),
    harness: { bump: (by) => (P.value += by), value: () => P.value },
  };
  const slice = {
    id: 'probe',
    version: 1,
    snapshot: () => {
      // (asked for by the script: data the save's text cannot hold, a thing that holds itself)
      if (P.circle) {
        const round = { value: P.value };
        round.self = round;
        return round;
      }
      return P.value ? { value: P.value } : undefined;
    },
    restore: (d) => {
      P.value = d.value;
      P.restored = d.value;
    },
    clear: () => {
      P.value = 0;
      P.cleared++;
    },
  };
  const source = {
    near(x, z, r, out) {
      for (const d of P.devices) if (Math.hypot(d.x - x, d.z - z) <= r) out.push(d);
    },
  };
  const tab = {
    id: 'probe',
    title: '探针',
    order: 5,
    sub: '内核探针',
    build(pane) {
      P.built++;
      pane.heading('探针');
      P.box = pane.box('盒子');
      pane.note('说明文字');
      pane.buttons([{ label: '加一', tip: '<b>加一</b><br>探针的数加一。', go: true, click: () => P.value++ }, { label: '不动', click: () => {} }], 2);
      pane.message()('刚才：没事', false);
    },
    tick() {
      P.ticks++;
    },
  };
  window.__rtModules = [
    {
      id: 'probe',
      systems: [system],
      slices: [slice],
      interact: [source],
      devTabs: [tab],
      setup(ctx) {
        P.setup = true;
        P.vehiclesAtSetup = ctx.vehicles.length;
        for (const type of ['game:new', 'game:restored', 'clock:day', 'clock:hour', 'body:ate', 'body:drank']) {
          ctx.events.on(type, (e) => P.events.push([type, type === 'body:ate' ? { item: e.item.item } : { ...e }]));
        }
      },
    },
  ];
}

/** a page of a context, the game waited for; page errors kept (the kernel's own reports, which this script provokes, apart) */
async function openPage(ctx, address) {
  const page = await ctx.newPage();
  const errors = [];
  const reported = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (m.text().startsWith('[kernel]')) reported.push(m.text());
    else errors.push(`console: ${m.text()}`);
  });
  const ready = () => page.waitForFunction(() => window.__rt?.ready === true, null, { timeout: 180_000 });
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await ready();
  const rt = (name, ...args) => page.evaluate(({ name, args }) => window.__rt[name](...args), { name, args });
  // (what the probe wrote down, without its devices and the tab's elements: only what can be sent across)
  const P = () =>
    page.evaluate(() => {
      const { box, button, lever, thrower, shapeless, wordless, sticky, devices, ...rest } = window.__probe;
      return rest;
    });
  return { page, errors, reported, ready, rt, P };
}

try {
  // ---------------------------------------------------------------- 0. without the probe: the game and its own modules
  /** the kernel of the game by itself: what the probe is then added to */
  let base;
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const { page, errors, rt } = await openPage(ctx, `${url}/modcar.html?shot=1`);
    const k = await rt('kernel');
    base = k;
    console.log('the game by itself', JSON.stringify(k));
    check(k.modules.length === ownModules && k.modules.join() === [...k.modules].sort().join() && new Set(k.modules).size === k.modules.length, `the game's modules (${k.modules}) are not one for each of the ${ownModules} folders under src/game/modcar/v3, in order`);
    check(k.lastError === '' && k.errors === 0 && Object.values(k.systems).every((x) => !x.failed && x.errors === 0), `the kernel reported: ${k.lastError}`);
    check(k.slices.carried.length === 0 && k.slices.held.length === 0 && k.slices.reports.length === 0, `a new game has slices set aside: ${JSON.stringify(k.slices)}`);
    check(k.clock.day === 0 && k.clock.worldSeconds > 0 && k.clock.worldSeconds < 120 && k.clock.waiting === false, `the clock after the first steps: ${JSON.stringify(k.clock)}`);
    const tele = await rt('telemetry');
    check(JSON.stringify(tele.kernel) === JSON.stringify(k), 'telemetry().kernel is not the kernel entry');
    check(typeof tele.place === 'string' && typeof tele.tutorial === 'string' && 'held' in tele && 'garage' in tele, 'telemetry lost a key');
    await rt('dev', true);
    const tabs = await page.evaluate(() => ({
      rows: document.querySelectorAll('.mc-dev .tabs').length,
      first: [...document.querySelectorAll('.mc-dev .tabs:not(.more) span')].map((s) => s.dataset.t),
      more: [...document.querySelectorAll('.mc-dev .tabs.more span')].map((s) => s.dataset.t),
      panes: document.querySelectorAll('.mc-dev .pane').length,
    }));
    console.log('panel', JSON.stringify(tabs));
    // (the eight as they always were; the modules' tabs, when there are any, in a second row)
    check(tabs.first.join() === EIGHT && tabs.more.join() === k.devTabs.join() && tabs.rows === (k.devTabs.length ? 2 : 1) && tabs.panes === 8 + k.devTabs.length, 'the panel is not its eight tabs and the modules’');
    const save = await page.evaluate(() => window.__rt.game.snapshot());
    check(save === null, 'a screenshot page made a save');
    check(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- A. a test page with the probe module
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(probe);
    const { page, errors, reported, rt, P } = await openPage(ctx, `${url}/modcar.html?shot=1`);
    let p = await P();
    let k = await rt('kernel');
    console.log('installed', JSON.stringify({ modules: k.modules, systems: Object.keys(k.systems), slices: k.slices.ids, interact: k.interact, devTabs: k.devTabs, init: p.init, vehiclesAtSetup: p.vehiclesAtSetup, vehiclesAtInit: p.vehiclesAtInit, readyAtInit: p.readyAtInit, hourAtInit: p.hourAtInit, skyAtInit: p.skyAtInit, events: p.events }));
    // (after the game's own, whatever those are)
    check(k.modules.join() === [...base.modules, 'probe'].join() && k.systems.probe && Object.keys(k.systems).at(-1) === 'probe', `the module is not installed after the game's own: ${k.modules}`);
    check(k.slices.ids.join() === [...base.slices.ids, 'probe'].join() && k.interact === base.interact + 1 && k.devTabs.includes('probe') && k.devTabs.length === base.devTabs.length + 1, 'the module is not all installed');
    check(p.setup && p.vehiclesAtSetup === 0, 'setup did not run before the vehicles were there');
    check(p.init === 1 && p.vehiclesAtInit === 4 && p.readyAtInit === false, 'init did not run once, after the vehicles were there and before the game was ready');
    // (the world's clock has the hour from the start; the environment's sky is still as it was made, at noon, until the first frame)
    check(close(p.hourAtInit, k.clock.startHour, 1e-12) && p.skyAtInit === 12 && k.clock.startHour !== 12, `at init the clock's hour is ${p.hourAtInit} (the journey began at ${k.clock.startHour}) and the sky's ${p.skyAtInit}`);
    check(JSON.stringify(p.events) === JSON.stringify([['game:new', {}]]), `a new game was not announced once: ${JSON.stringify(p.events)}`);
    // (a screenshot page steps 0.8 s before it is ready: 48 steps)
    check(p.pre === 48 && p.step === 48 && p.late === 48, `hooks after the first 0.8 s: ${p.pre} ${p.step} ${p.late}`);
    check(k.systems.probe.frames === 48 && k.systems.probe.budgetMs === 0.5 && k.systems.probe.failed === false, 'the system is not counted and budgeted');

    // the three hooks: once a step, in order; simulate(0) is two steps of no seconds
    await page.evaluate(() => {
      window.__probe.order.length = 0;
      window.__probe.dts.length = 0;
    });
    await rt('simulate', 1);
    p = await P();
    check(p.pre === 108 && p.step === 108 && p.late === 108, `hooks after a second more: ${p.pre} ${p.step} ${p.late}`);
    check(p.order.length === 180 && p.order.every((x, i) => x === ['pre', 'step', 'late'][i % 3]), 'the hooks did not run pre, step, late');
    check(p.dts.every((d) => close(d, 1 / 60, 1e-12)), 'the hooks were not handed the step');
    await page.evaluate(() => (window.__probe.dts.length = 0));
    await rt('simulate', 0);
    p = await P();
    check(p.pre === 110 && p.dts.length === 2 && p.dts[0] === 0 && p.dts[1] === 0, `simulate(0): ${p.pre} steps, dt ${p.dts}`);
    k = await rt('kernel');
    const ms = k.systems.probe.ms;
    console.log('timed', JSON.stringify(k.systems.probe));
    check([ms.pre, ms.step, ms.late, ms.total].every((x) => Number.isFinite(x) && x >= 0) && ms.total < 5 && k.systems.probe.frames === 110, 'the timing is not sane');

    // the world's clock: it passes with the hour, moves on with the hour set forward, and to the next day with it set back
    const c0 = k.clock;
    const hour0 = await page.evaluate(() => window.__rt.game.env.clock.hourAt(window.__rt.game.time));
    check(c0.day === 0 && close(c0.hour, hour0, 1e-9) && close(c0.worldSeconds, (c0.hour - c0.startHour) * 3600, 1e-6) && c0.worldSeconds > 0, `the clock does not follow the hour: ${JSON.stringify(c0)} at ${hour0}`);
    await page.evaluate(() => (window.__probe.events.length = 0));
    await rt('setHour', c0.hour + 2);
    p = await P();
    let c = (await rt('kernel')).clock;
    console.log('two hours on', JSON.stringify(c), JSON.stringify(p.events));
    check(close(c.worldSeconds - c0.worldSeconds, 7200, 1e-3) && c.day === 0, 'two hours on were not 7,200 s');
    check(p.events.length === 1 && p.events[0][0] === 'clock:hour' && p.events[0][1].crossed === 2 && p.events[0][1].hour === Math.floor(c.hour), `the hours passed were not said: ${JSON.stringify(p.events)}`);
    // (in the step the hour changed in, preStep still read the old time and lateUpdate the new: the second step of simulate(0) reads the new in both)
    await rt('setHour', c0.hour);
    p = await P();
    c = (await rt('kernel')).clock;
    console.log('set back', JSON.stringify(c), JSON.stringify(p.events.slice(1)));
    check(c.day === 1 && close(c.worldSeconds - c0.worldSeconds, 86400, 1e-3), 'the hour set back was not the next day');
    check(p.events.length === 3 && p.events[1][0] === 'clock:day' && p.events[1][1].day === 1 && p.events[2][0] === 'clock:hour' && p.events[2][1].crossed === 22, `midnight was not said: ${JSON.stringify(p.events)}`);
    const order = await page.evaluate(() => {
      const g = window.__rt.game;
      const P = window.__probe;
      g.env.clock.setHour(g.env.clock.hourAt(g.time) + 1, g.time);
      g.step(0, 1);
      return { pre: P.clockAtPre, late: P.clockAtLate, now: g.clock.worldSeconds };
    });
    check(close(order.late - order.pre, 3600, 1e-3) && order.late === order.now, `preStep and lateUpdate of the step the hour changed in: ${JSON.stringify(order)}`);
    const passed = await page.evaluate(() => {
      const g = window.__rt.game;
      const a = { s: g.clock.worldSeconds, h: g.env.clock.hourAt(g.time) };
      g.simulate(5);
      return { ds: g.clock.worldSeconds - a.s, dh: g.env.clock.hourAt(g.time) - a.h, same: g.clock.hour === g.env.sky.hour };
    });
    check(passed.ds > 60 && close(passed.ds, passed.dh * 3600, 1e-6) && passed.same, `five seconds of play: ${JSON.stringify(passed)}`);
    // a step of negative seconds (the live loop's first frame can be one: its time stamp may lie before the time
    // the loop was started at): the hour goes back a little with the session's time, and the clock waits
    const back = await page.evaluate(() => {
      const g = window.__rt.game;
      const P = window.__probe;
      const at = () => ({ s: g.clock.worldSeconds, day: g.clock.day, waiting: g.clock.waiting });
      const a = at();
      P.dts.length = 0;
      const t0 = g.time;
      g.step(-0.05, 1);
      const held = at();
      const wentBack = g.time - t0;
      g.step(0.02, 1);
      const still = at();
      g.step(0.05, 1);
      return { a, held, still, on: at(), wentBack, dts: [...P.dts] };
    });
    console.log('a step back', JSON.stringify(back));
    check(back.held.s === back.a.s && back.still.s === back.a.s && back.on.day === back.a.day && back.on.s > back.a.s && back.on.s - back.a.s < 10, 'the clock did not wait out a step of negative seconds');
    check(back.held.waiting === true && back.still.waiting === true && back.on.waiting === false, `the clock does not say it waits: ${JSON.stringify(back)}`);
    // (the game itself went back by the step; the hooks were handed none of it)
    check(close(back.wentBack, -0.05, 1e-12) && back.dts.join() === '0,0.02,0.05', `the hooks of a step of negative seconds were handed ${back.dts}`);

    // the body's events: a drink held to the mouth, a bag of crackers eaten
    await page.evaluate(() => (window.__probe.events.length = 0));
    await rt('hold', 'item:drink_water');
    await rt('takeFor', 2);
    p = await P();
    const drunk = p.events.filter((e) => e[0] === 'body:drank');
    const litres = drunk.reduce((a, e) => a + e[1].litres, 0);
    console.log('drank', drunk.length, 'times,', litres.toFixed(3), 'L');
    check(drunk.length > 60 && drunk.every((e) => e[1].liquid === 'water') && close(litres, 0.45, 0.03), `drinking was not heard: ${drunk.length} events, ${litres} L`);
    await rt('hold', 'item:food_chips');
    await rt('takeFor', 0.2);
    await rt('simulate', 5);
    p = await P();
    const ate = p.events.filter((e) => e[0] === 'body:ate');
    console.log('ate', JSON.stringify(ate));
    check(ate.length === 1 && ate[0][1].item === 'food_chips', `eating was not heard: ${JSON.stringify(ate)}`);

    // a device from the module's source: found by the mark, a press uses it; one that wants E held
    const aimAt = (which) =>
      page.evaluate((which) => {
        const g = window.__rt.game;
        const P = window.__probe;
        const w = g.player.walker;
        const at = { x: w.x, z: w.z };
        P.devices = [];
        // (somewhere free round where one stands: the first side on which the mark finds it)
        for (const from of [Math.PI, 0, Math.PI / 2, -Math.PI / 2]) {
          const d = P[which];
          d.x = at.x - Math.cos(from) * 1.1;
          d.z = at.z - Math.sin(from) * 1.1;
          d.y = w.y + 1.35;
          P.devices = [d];
          w.place(at.x, at.z, 0);
          const target = window.__rt.aimPoint(d.x, d.y, d.z, from, 1.1);
          if (target === `device:${d.id}`) return target;
        }
        return String(g.player.telemetry().target);
      }, which);
    await page.evaluate(() => {
      window.__rt.game.player.held = null;
      window.__rt.game.simulate(0);
    });
    let target = await aimAt('button');
    const shown = await page.evaluate(() => ({ acts: document.querySelector('.mc-acts')?.textContent ?? '', card: document.body.textContent.includes('探针在这儿') }));
    console.log('aimed', target, JSON.stringify(shown));
    check(target === 'device:probe:button', `the mark is not on the probe's button (${target})`);
    check(shown.acts.includes('按探针') && shown.card, 'the prompt and the card of the device are not shown');
    await rt('press');
    p = await P();
    check(p.used.join() === 'probe:button', `E did not use the button (${p.used})`);
    target = await aimAt('lever');
    check(target === 'device:probe:lever', `the mark is not on the probe's lever (${target})`);
    const half = await rt('holdFor', 0.25);
    p = await P();
    check(p.used.length === 1 && p.held.length > 5 && p.held.every((x, i) => x > 0 && x < 1 && (i === 0 || x > p.held[i - 1])) && half.progress === 0, `a short hold: used ${p.used}, progress ${p.held.slice(-1)}`);
    await rt('holdFor', 0.8);
    p = await P();
    check(p.used.join() === 'probe:button,probe:lever', `the hold did not use the lever once (${p.used})`);
    // A device whose own code throws. Each is reported as the last error and passed over, and the step it
    // happened in goes on to its end: the three hooks have run the same number of times afterwards (a throw
    // that got out of the player's code would end the step before the second of them).
    /** the kernel's count of reports, the last one, and whether every step so far ran to its end */
    const faults = async () => {
      const q = await P();
      const kk = await rt('kernel');
      return { errors: kk.errors, last: kk.lastError, whole: q.pre === q.step && q.step === q.late, steps: q.pre, used: q.used, hits: q.hits, stuck: q.stuck };
    };
    let f0 = await faults();
    check(f0.errors === base.errors && f0.last === '', `an error before any was provoked: ${f0.last}`);
    // … on a press: once, not again while the mark stays on it
    target = await aimAt('thrower');
    check(target === 'device:probe:thrower', `the mark is not on the device that throws (${target})`);
    await rt('press');
    await rt('simulate', 0.2);
    let f = await faults();
    console.log('a press that throws', JSON.stringify(f));
    check(f.used.at(-1) === 'probe:thrower' && f.used.filter((x) => x === 'probe:thrower').length === 1, `the device was not pressed once (${f.used})`);
    check(f.last === 'interactable device probe:thrower (use): probe use' && f.errors === f0.errors + 1 && f.whole, `a press that throws: ${JSON.stringify(f)}`);
    // … when asked for its shape: every step it is within reach, and the mark passes it over
    f0 = f;
    await page.evaluate(() => {
      const P = window.__probe;
      const w = window.__rt.game.player.walker;
      Object.assign(P.shapeless, { x: w.x + 0.4, y: w.y + 1.3, z: w.z });
      P.devices = [P.shapeless];
    });
    await rt('simulate', 0.5);
    f = await faults();
    console.log('a shape that throws', JSON.stringify(f));
    check(f.hits === 30 && f.errors === f0.errors + 30 && f.last === 'interactable device probe:shapeless (hit): probe hit' && f.whole && f.steps === f0.steps + 30, `a shape that throws: ${JSON.stringify(f)}`);
    check(!String((await rt('telemetry')).target).startsWith('device:probe'), 'the device that could not be asked for its shape is under the mark');
    // … when asked for its word: the mark is on it, the prompt has nothing of it
    f0 = f;
    target = await aimAt('wordless');
    await rt('simulate', 0.1);
    f = await faults();
    const worded = await page.evaluate(() => document.querySelector('.mc-acts')?.textContent ?? '');
    console.log('a word that throws', JSON.stringify(f), JSON.stringify(worded));
    check(target === 'device:probe:wordless' && f.last === 'interactable device probe:wordless (word): probe word' && f.errors > f0.errors && f.whole, `a word that throws: ${target} ${JSON.stringify(f)}`);
    // … while E is held: once, and the hold is over
    target = await aimAt('sticky');
    f0 = await faults();
    await rt('holdFor', 0.3);
    f = await faults();
    console.log('a hold that throws', JSON.stringify(f));
    check(target === 'device:probe:sticky' && f.stuck === 1 && f.last === 'interactable device probe:sticky (hold): probe hold' && f.errors === f0.errors + 1 && f.whole && !f.used.includes('probe:sticky'), `a hold that throws: ${target} ${JSON.stringify(f)}`);
    check(reported.length === 4 && ['(use)', '(hit)', '(word)', '(hold)'].every((w, i) => reported[i].includes(w)), `each written out once: ${reported.length} lines`);

    // nothing near: nothing of the module's under the mark
    await page.evaluate(() => {
      window.__probe.devices = [];
      window.__rt.game.simulate(0);
      window.__rt.lastError = '';
    });
    check(!String((await rt('telemetry')).target).startsWith('device:probe'), 'a device that is gone is still under the mark');

    // a hook that throws: the last error, and the game goes on; then two hooks, then a listener that throws
    const before = await P();
    const errors0 = (await rt('kernel')).errors;
    await page.evaluate(() => (window.__probe.throwIn = 'step'));
    await rt('simulate', 0.5);
    p = await P();
    k = await rt('kernel');
    let last = await page.evaluate(() => window.__rt.lastError);
    console.log('threw', JSON.stringify({ last, errors: k.errors, system: k.systems.probe.errors, toast: await page.evaluate(() => document.querySelector('.mc-toast')?.textContent) }));
    check(last === 'system probe (step): probe step' && k.lastError === last, `the throw is not the last error (${last})`);
    check(k.systems.probe.errors === 30 && k.errors === errors0 + 30, `every throw counted: ${k.systems.probe.errors}, ${k.errors}`);
    check(p.pre === before.pre + 30 && p.late === before.late + 30, 'the frame did not go on past the throw');
    check(reported.length === 5 && reported[4].includes('system probe (step)'), `said once on the console: ${reported.length}`);
    // (a system with broken state throws in each of its hooks, every frame: each kind is still written out once)
    await page.evaluate(() => (window.__probe.throwIn = 'both'));
    await rt('simulate', 0.5);
    k = await rt('kernel');
    check(k.systems.probe.errors === 90 && k.errors === errors0 + 90, `two hooks throwing counted: ${k.systems.probe.errors}`);
    check(reported.length === 6 && reported[5].includes('system probe (preStep)'), `two hooks throwing every frame wrote ${reported.length - 5} lines, not one`);
    await page.evaluate(() => {
      window.__probe.throwIn = '';
      window.__rt.lastError = '';
      window.__rt.game.events.on('clock:hour', () => {
        throw new Error('probe listener');
      });
      window.__probe.events.length = 0;
    });
    await rt('setHour', ((await rt('kernel')).clock.hour + 1.5) % 24);
    last = await page.evaluate(() => window.__rt.lastError);
    p = await P();
    check(last === 'event clock:hour: probe listener', `a listener's throw is not the last error (${last})`);
    check(p.events.some((e) => e[0] === 'clock:hour'), 'the other listeners were not called');
    const tele = await rt('telemetry');
    check(tele.place === 'garage' && tele.exploded === false, 'the game did not go on');

    // a system's test functions by name
    const bumped = await page.evaluate(() => [window.__rt.game.systems.harness('probe', 'bump', 5), window.__rt.game.systems.harness('probe', 'value')]);
    check(bumped.join() === '5,5' && (await rt('kernel')).systems.probe.own.value === 5, 'the harness functions do not answer');

    // the developer's panel: the eight tabs as they were, the module's in a second row; its content built when shown
    await rt('dev', true);
    let panel = await page.evaluate(() => ({
      first: [...document.querySelectorAll('.mc-dev .tabs:not(.more) span')].map((s) => s.dataset.t),
      more: [...document.querySelectorAll('.mc-dev .tabs.more span')].map((s) => `${s.dataset.t}:${s.textContent}`),
      built: window.__probe.built,
    }));
    console.log('panel', JSON.stringify(panel));
    check(panel.first.join() === EIGHT && panel.more.includes('probe:探针') && panel.more.length === base.devTabs.length + 1 && panel.built === 0, 'the tabs are not the eight, the modules’ and the probe');
    await page.click('.mc-dev .tabs.more span[data-t="probe"]');
    panel = await page.evaluate(() => {
      const pane = document.querySelector('.mc-dev .pane[data-p="probe"]');
      return {
        tab: window.__rt.game.devPanel.tab,
        on: [...document.querySelectorAll('.mc-dev .tabs span.on')].map((s) => s.dataset.t),
        shown: [...document.querySelectorAll('.mc-dev .pane')].filter((x) => x.style.display !== 'none').map((x) => x.dataset.p),
        made: [...pane.querySelector('.body').children].map((e) => `${e.tagName.toLowerCase()}.${e.className}:${e.textContent}`),
        tip: pane.querySelector('button.go')?.dataset.tip,
        sub: document.querySelector('.mc-dev .hd .sub').textContent,
        built: window.__probe.built,
      };
    });
    console.log('tab', JSON.stringify(panel));
    check(panel.tab === 'probe' && panel.on.join() === 'probe' && panel.shown.join() === 'probe' && panel.built === 1 && panel.sub === '内核探针', 'the tab is not shown');
    check(panel.made.join('|') === 'h5.:探针|div.where:盒子|div.note:说明文字|div.btns two:加一不动|div.msg:刚才：没事' && panel.tip.includes('加一'), `the tab's content: ${panel.made.join('|')}`);
    await page.click('.mc-dev .pane[data-p="probe"] button.go');
    check((await P()).value === 6, 'the button of the tab does nothing');
    await page.waitForFunction(() => window.__probe.ticks > 2, null, { timeout: 30_000 });
    check((await rt('devTab', 'weather')) === 'weather' && (await rt('devTab', 'probe')) === 'probe' && (await P()).built === 1, 'going to another tab and back built the content again');
    await rt('dev', false);

    check(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);
    // (four devices, the hook in step, the hook in preStep, the listener: each written out once)
    check(reported.length === 7, `the kernel's reports on the console: ${reported.length}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- B. the player's kept game: save, reload, new game
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(probe);
    const { page, errors, reported, ready, rt, P } = await openPage(ctx, `${url}/modcar.html`);
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1') ?? 'null'));
    // (the page as it goes writes its save: stopped, so that what this script puts into the storage stays)
    // Returns what the page would have saved while it was still loading — its vehicles back, its systems not yet
    // set up — or null when the page was ready before it could be asked.
    const reloadWith = async (edit) => {
      await page.evaluate(
        ({ edit }) => {
          window.__rt.game.saveOff = true;
          const s = JSON.parse(localStorage.getItem('modcar.save.v1'));
          // eslint-disable-next-line no-new-func
          new Function('s', edit)(s);
          localStorage.setItem('modcar.save.v1', JSON.stringify(s));
        },
        { edit },
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => (window.__rt?.game?.vehicles?.length ?? 0) > 0, null, { timeout: 180_000 });
      const early = await page.evaluate(() => (window.__rt.ready || window.__probe.init ? null : window.__rt.game.snapshot()));
      await ready();
      return early;
    };
    // (what the game said of itself: an hour of the clock may pass meanwhile, the page being live)
    const said = (q) => q.events.filter((e) => e[0].startsWith('game:')).map((e) => e[0]).join();
    /**
     * How the page's first steps went, read in one go (the page is live): the seconds the hooks were handed, and
     * by how much the game's own time lies behind their sum — the loop's first frame can be a step of negative
     * seconds, which the game takes and the hooks are not handed.
     */
    const firstSteps = () =>
      page.evaluate(() => {
        const g = window.__rt.game;
        const dts = window.__probe.dts;
        return { handed: dts.slice(0, 3), least: dts.reduce((a, b) => Math.min(a, b), Infinity), wentBack: g.time - dts.reduce((a, b) => a + b, 0), day: g.clock.day };
      });
    let p = await P();
    let first = await firstSteps();
    console.log('a kept game', JSON.stringify({ events: p.events, first }));
    check((await page.evaluate(() => window.__rt.params.keep)) === true && said(p) === 'game:new', 'not a new kept game');
    check(first.least >= 0 && first.day === 0, `the first steps of a live page: ${JSON.stringify(first)}`);

    // something to keep, three hours on, saved
    const c0 = (await rt('kernel')).clock;
    await page.evaluate(() => window.__rt.game.systems.harness('probe', 'bump', 7));
    await rt('setHour', c0.hour + 3);
    // (the save and the clock read in one go: the page is live, the clock goes on between two questions)
    const kept = await page.evaluate(() => {
      const g = window.__rt.game;
      g.save();
      return { clock: g.kernel.telemetry().clock, s: JSON.parse(localStorage.getItem('modcar.save.v1')) };
    });
    let s = kept.s;
    const c1 = kept.clock;
    console.log('saved', JSON.stringify({ slices: s.slices, clock: s.clock, hour: s.hour }));
    check(JSON.stringify(s.slices.probe) === '{"v":1,"d":{"value":7}}' && Object.keys(s.slices).join() === Object.keys(s.slices).sort().join(), `the slice is not in the save: ${JSON.stringify(s.slices)}`);
    check(s.clock.day === 0 && close(s.clock.hour, s.hour, 1e-9) && close(s.clock.start, c0.startHour, 1e-12) && close((s.clock.hour - s.clock.start) * 3600, c1.worldSeconds, 1e-6), `the clock is not in the save: ${JSON.stringify(s.clock)}`);
    check(c1.worldSeconds > 10800 && c1.worldSeconds < 10800 + 600, `three hours on are not in the clock: ${c1.worldSeconds}`);

    // the page again, with a slice of a system that is not there in the save: the slice restored, the clock gone on, the stranger kept
    const ghost = { v: 3, d: { herds: [[1, 2, 3]], note: 'kept' } };
    const early = await reloadWith(`s.slices.ghost = ${JSON.stringify(ghost)};`);
    console.log('while loading', early ? JSON.stringify({ slices: early.slices, clock: early.clock }) : 'the page was ready before it could be asked');
    // (a page hidden while it loads writes its save: the slices not yet read must be in it as they were loaded)
    if (early) check(JSON.stringify(early.slices.probe) === '{"v":1,"d":{"value":7}}' && JSON.stringify(early.slices.ghost) === JSON.stringify(ghost) && early.clock.day === 0, `a save written while loading lost the slices: ${JSON.stringify(early.slices)}`);
    p = await P();
    let k = await rt('kernel');
    first = await firstSteps();
    console.log('reloaded', JSON.stringify({ value: p.value, restored: p.restored, events: p.events, clock: k.clock, slices: k.slices, first }));
    check(first.least >= 0, `the first steps of a live page: ${JSON.stringify(first)}`);
    check(p.restored === 7 && p.value === 7 && p.init === 1, 'the slice did not come back');
    check(said(p) === 'game:restored', `the game did not say it was restored: ${JSON.stringify(p.events)}`);
    check(k.clock.day === 0 && close(k.clock.startHour, c0.startHour, 1e-12) && k.clock.worldSeconds >= c1.worldSeconds && k.clock.worldSeconds - c1.worldSeconds < 300, `the clock did not go on from the save: ${JSON.stringify(k.clock)} after ${c1.worldSeconds}`);
    check(k.slices.carried.join() === 'ghost' && k.lastError === '', `the stranger's slice is not carried quietly: ${JSON.stringify(k.slices)} ${k.lastError}`);
    await page.evaluate(() => window.__rt.game.save());
    s = await stored();
    check(JSON.stringify(s.slices.ghost) === JSON.stringify(ghost) && s.slices.probe.d.value === 7 && Object.keys(s.slices).join() === Object.keys(s.slices).sort().join(), `the stranger's slice is not in the next save as it came: ${JSON.stringify(s.slices)}`);
    const vehicles = await page.evaluate(() => window.__rt.game.vehicles.length);

    // a slice that hands out what the save's text cannot hold (a thing that holds itself): the save is written
    // all the same, with that slice as it last was, and the fault is the last error
    const round = await page.evaluate(() => {
      const g = window.__rt.game;
      const P = window.__probe;
      const w = g.player.walker;
      const read = () => JSON.parse(localStorage.getItem('modcar.save.v1'));
      g.save();
      const before = read();
      const errors = g.kernel.log.count;
      // (something of the game's own that the next save must show, and the probe's value moved on)
      w.heading += 0.125;
      P.value = 99;
      P.circle = true;
      g.save();
      const after = read();
      const out = { turned: after.player.heading - before.player.heading, slice: after.slices.probe, ghost: after.slices.ghost, last: window.__rt.lastError, errors: g.kernel.log.count - errors };
      P.circle = false;
      P.value = 7;
      w.heading -= 0.125;
      window.__rt.lastError = '';
      g.save();
      return out;
    });
    console.log('a slice that cannot be written', JSON.stringify(round));
    check(close(round.turned, 0.125, 1e-9) && JSON.stringify(round.slice) === '{"v":1,"d":{"value":7}}' && JSON.stringify(round.ghost) === JSON.stringify(ghost), `the save was not written past the slice that cannot be: ${JSON.stringify(round)}`);
    check(round.last.startsWith('save slice probe (snapshot): ') && round.errors === 1, `the slice that cannot be written was not reported: ${round.last}`);

    // a save the browser will not keep (its storage full): said, once, and what was there stays
    const refused = await page.evaluate(() => {
      const g = window.__rt.game;
      const real = Storage.prototype.setItem;
      const before = localStorage.getItem('modcar.save.v1');
      const errors = g.kernel.log.count;
      Storage.prototype.setItem = function (key, value) {
        if (key === 'modcar.save.v1') throw new DOMException('the quota has been exceeded', 'QuotaExceededError');
        return real.call(this, key, value);
      };
      try {
        g.save();
        g.save();
      } finally {
        Storage.prototype.setItem = real;
      }
      const out = { errors: g.kernel.log.count - errors, last: window.__rt.lastError, kept: localStorage.getItem('modcar.save.v1') === before, toast: document.querySelector('.mc-toast')?.textContent ?? '' };
      window.__rt.lastError = '';
      return out;
    });
    console.log('a save the browser will not keep', JSON.stringify(refused));
    check(refused.errors === 2 && refused.last.startsWith('save: the browser would not keep the save') && refused.kept && refused.toast.startsWith('存档没能写进去'), `a save that could not be written: ${JSON.stringify(refused)}`);
    check(reported.filter((x) => x.includes('[kernel] save ')).length === 2, `the two faults of saving were not each written out once: ${reported.length}`);

    // a page on which the module's system does not come up (its set-up throws, this once): the slice is set
    // aside, and what that page saves still has what the save had of it; on the next page the system has it back
    await page.evaluate(() => localStorage.setItem('probe.failInit', '1'));
    await reloadWith('');
    p = await P();
    k = await rt('kernel');
    console.log('a system that did not come up', JSON.stringify({ failed: k.systems.probe.failed, slices: k.slices, restored: p.restored, hooks: p.pre, last: k.lastError }));
    check(k.systems.probe.failed === true && p.pre === 0 && p.restored === null && k.lastError === 'system probe (init): probe init', `the system came up after all: ${JSON.stringify(k.systems.probe)}`);
    check(k.slices.held.join() === 'probe' && k.slices.carried.join() === 'ghost,probe', `its slice is not set aside: ${JSON.stringify(k.slices)}`);
    await page.evaluate(() => window.__rt.game.save());
    s = await stored();
    check(JSON.stringify(s.slices.probe) === '{"v":1,"d":{"value":7}}' && JSON.stringify(s.slices.ghost) === JSON.stringify(ghost), `the page whose system was down wrote over its slice: ${JSON.stringify(s.slices)}`);
    await reloadWith('');
    p = await P();
    k = await rt('kernel');
    check(p.restored === 7 && p.value === 7 && k.systems.probe.failed === false && k.slices.held.length === 0 && k.lastError === '', `the system did not have its state back on the next page: ${JSON.stringify({ restored: p.restored, slices: k.slices, last: k.lastError })}`);

    // a save written while the world's clock waits (a step of negative seconds, and the page hidden there and
    // then): the hour in it stands behind its clock, and the page that takes it up must not take that for the
    // hour set back — which would be a day gone by
    const waited = await page.evaluate(() => {
      const g = window.__rt.game;
      g.step(-0.3, 1);
      g.save();
      // (nothing written over it before the page is opened again)
      g.saveOff = true;
      const s = JSON.parse(localStorage.getItem('modcar.save.v1'));
      return { waiting: g.clock.waiting, hour: s.hour, clock: s.clock, seconds: g.clock.worldSeconds };
    });
    await reloadWith('');
    k = await rt('kernel');
    console.log('a save written while the clock waited', JSON.stringify({ waited, clock: k.clock }));
    check(waited.waiting === true && waited.hour < waited.clock.hour, `the save was not written while the clock waited: ${JSON.stringify(waited)}`);
    check(k.clock.day === waited.clock.day && k.clock.worldSeconds >= waited.seconds && k.clock.worldSeconds - waited.seconds < 300, `the page that took it up is not where the clock was: ${JSON.stringify(k.clock)} after ${waited.seconds}`);

    // a save from before there were slices and the clock: loads as it did
    await reloadWith('delete s.slices; delete s.clock;');
    p = await P();
    k = await rt('kernel');
    const old = await page.evaluate(() => ({ vehicles: window.__rt.game.vehicles.length, toast: document.querySelector('.mc-toast')?.textContent ?? '', hour: window.__rt.game.env.clock.hourAt(0) }));
    console.log('an old save', JSON.stringify({ value: p.value, cleared: p.cleared, events: p.events, clock: k.clock, old, first: await firstSteps() }));
    check(old.vehicles === vehicles && old.toast.startsWith('接着上次的进度'), 'the old save did not load as before');
    check(p.value === 0 && p.restored === null && p.cleared === 1 && said(p) === 'game:restored', 'its slices are not as a new game starts');
    check(k.clock.day === 0 && close(k.clock.startHour, old.hour, 1e-9) && k.clock.worldSeconds < 300 && k.lastError === '', `its clock does not begin at its hour: ${JSON.stringify(k.clock)}`);

    // F9 twice: a new game — the slice and the clock from the start
    await page.evaluate(() => window.__rt.game.systems.harness('probe', 'bump', 3));
    await page.evaluate(() => window.__rt.game.save());
    // (the new page's game waited for, not the old one's: first its document, then its game)
    const loaded = page.waitForEvent('domcontentloaded', { timeout: 120_000 });
    await page.keyboard.press('F9');
    await page.keyboard.press('F9');
    await loaded;
    await ready();
    p = await P();
    k = await rt('kernel');
    s = await stored();
    console.log('a new game', JSON.stringify({ value: p.value, events: p.events, clock: k.clock, saved: !!s, first: await firstSteps() }));
    check(p.value === 0 && p.restored === null && said(p) === 'game:new', 'the new game is not new to the module');
    check(k.clock.day === 0 && k.clock.worldSeconds < 300 && k.slices.carried.length === 0, 'the new game does not begin its clock');
    await page.evaluate(() => {
      window.__rt.game.saveOff = true;
      localStorage.removeItem('modcar.save.v1');
    });
    check(errors.length === 0, `page errors: ${errors.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(bad ? `modcar_kernel: ${bad} FAILED` : 'modcar_kernel: ok');
process.exit(bad ? 1 : 0);
