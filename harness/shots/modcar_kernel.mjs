// The V3 kernel's seams in the real game (docs/V3/nodes/N0-foundation.md). No system exists yet, so the page is
// handed a probe module by this script (window.__rtModules, read by entry.ts) that uses every seam, and the game
// is asked what became of it:
//   0. without any module the kernel is empty and the developer's panel has its eight tabs and no second row;
//   A. on a test page: the module is installed, its system set up after the vehicles are there, its three hooks
//      run once a step in order (twice with no seconds on simulate(0)), the world's clock follows the hour and
//      goes on to the next day when the hour is set back, the body's and the clock's events are heard, a device
//      from its source is found by the mark and worked with E (a press, a hold), a hook that throws is the last
//      error while the game goes on, its tab stands in the panel's second row and builds its content;
//   B. in the player's kept game: its slice and the clock are in the save and come back after a reload, a slice
//      of a system that is not there is kept untouched, a save from before slices loads as it did, and a new
//      game starts everything again.
//   SHOTS_GL=llvmpipe node harness/shots/modcar_kernel.mjs
import { launchBrowser, startServer } from './lib.mjs';

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

/** runs in the page before its own scripts: the probe module, and what it writes down (window.__probe) */
function probe() {
  const P = {
    setup: false, init: 0, pre: 0, step: 0, late: 0, disposed: false, order: [], dts: [],
    vehiclesAtInit: -1, readyAtInit: null, clockAtPre: -1, clockAtLate: -1,
    events: [], used: [], held: [], devices: [], throwIn: '', value: 0, restored: null, cleared: 0, ticks: 0, built: 0,
  };
  window.__probe = P;
  const device = (id, zh, more) => ({ id, x: 0, y: 0, z: 0, radius: 0.3, word: { zh, en: id }, state: { zh: '探针在这儿', en: 'the probe is here' }, use: () => P.used.push(id), ...more });
  P.button = device('probe:button', '按探针');
  P.lever = device('probe:lever', '拉探针', { holdS: 0.5, holding: (p) => P.held.push(p) });
  const system = {
    id: 'probe',
    budget: { cpuMs: 0.5 },
    init(ctx) {
      P.init++;
      P.vehiclesAtInit = ctx.vehicles.length;
      P.readyAtInit = window.__rt ? window.__rt.ready : null;
    },
    preStep(dt, ctx) {
      P.pre++;
      P.order.push('pre');
      P.dts.push(dt);
      P.clockAtPre = ctx.clock.worldSeconds;
      if (P.throwIn === 'pre') throw new Error('probe pre');
    },
    step() {
      P.step++;
      P.order.push('step');
      if (P.throwIn === 'step') throw new Error('probe step');
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
    snapshot: () => (P.value ? { value: P.value } : undefined),
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
      const { box, button, lever, devices, ...rest } = window.__probe;
      return rest;
    });
  return { page, errors, reported, ready, rt, P };
}

try {
  // ---------------------------------------------------------------- 0. no module: the game as it was
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const { page, errors, rt } = await openPage(ctx, `${url}/modcar.html?shot=1`);
    const k = await rt('kernel');
    console.log('no module', JSON.stringify(k));
    check(k.modules.length === 0 && Object.keys(k.systems).length === 0, 'the kernel is not empty without modules');
    check(k.slices.ids.length === 0 && k.slices.carried.length === 0 && k.interact === 0 && k.devTabs.length === 0, 'something is registered without modules');
    check(k.lastError === '' && k.errors === 0, `the kernel reported: ${k.lastError}`);
    check(k.clock.day === 0 && k.clock.worldSeconds > 0 && k.clock.worldSeconds < 120, `the clock after the first steps: ${JSON.stringify(k.clock)}`);
    const tele = await rt('telemetry');
    check(JSON.stringify(tele.kernel) === JSON.stringify(k), 'telemetry().kernel is not the kernel entry');
    check(typeof tele.place === 'string' && typeof tele.tutorial === 'string' && 'held' in tele && 'garage' in tele, 'telemetry lost a key');
    await rt('dev', true);
    const tabs = await page.evaluate(() => ({ rows: document.querySelectorAll('.mc-dev .tabs').length, own: [...document.querySelectorAll('.mc-dev .tabs span')].map((s) => s.dataset.t), panes: document.querySelectorAll('.mc-dev .pane').length }));
    console.log('panel', JSON.stringify(tabs));
    check(tabs.rows === 1 && tabs.own.join() === 'parts,lab,proving,place,weather,time,look,terrain' && tabs.panes === 8, 'the panel is not its eight tabs');
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
    console.log('installed', JSON.stringify({ modules: k.modules, systems: Object.keys(k.systems), slices: k.slices.ids, interact: k.interact, devTabs: k.devTabs, init: p.init, vehiclesAtSetup: p.vehiclesAtSetup, vehiclesAtInit: p.vehiclesAtInit, readyAtInit: p.readyAtInit, events: p.events }));
    check(k.modules.join() === 'probe' && k.systems.probe && k.slices.ids.join() === 'probe' && k.interact === 1 && k.devTabs.join() === 'probe', 'the module is not all installed');
    check(p.setup && p.vehiclesAtSetup === 0, 'setup did not run before the vehicles were there');
    check(p.init === 1 && p.vehiclesAtInit === 4 && p.readyAtInit === false, 'init did not run once, after the vehicles were there and before the game was ready');
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
      const at = () => ({ s: g.clock.worldSeconds, day: g.clock.day });
      const a = at();
      g.step(-0.05, 1);
      const held = at();
      g.step(0.02, 1);
      const still = at();
      g.step(0.05, 1);
      return { a, held, still, on: at() };
    });
    console.log('a step back', JSON.stringify(back));
    check(back.held.s === back.a.s && back.still.s === back.a.s && back.on.day === back.a.day && back.on.s > back.a.s && back.on.s - back.a.s < 10, 'the clock did not wait out a step of negative seconds');

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
    // nothing near: nothing of the module's under the mark
    await page.evaluate(() => {
      window.__probe.devices = [];
      window.__rt.game.simulate(0);
    });
    check(!String((await rt('telemetry')).target).startsWith('device:probe'), 'a device that is gone is still under the mark');

    // a hook that throws: the last error, and the game goes on; then a listener that throws
    check((await page.evaluate(() => window.__rt.lastError)) === '', 'an error before any was provoked');
    const before = await P();
    await page.evaluate(() => (window.__probe.throwIn = 'step'));
    await rt('simulate', 0.5);
    p = await P();
    k = await rt('kernel');
    let last = await page.evaluate(() => window.__rt.lastError);
    console.log('threw', JSON.stringify({ last, errors: k.errors, system: k.systems.probe.errors, toast: await page.evaluate(() => document.querySelector('.mc-toast')?.textContent) }));
    check(last === 'system probe (step): probe step' && k.lastError === last, `the throw is not the last error (${last})`);
    check(k.systems.probe.errors === 30 && k.errors === 30, `every throw counted: ${k.systems.probe.errors}, ${k.errors}`);
    check(p.pre === before.pre + 30 && p.late === before.late + 30, 'the frame did not go on past the throw');
    check(reported.length === 1 && reported[0].includes('system probe (step)'), `said once on the console: ${reported.length}`);
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
    check(panel.first.join() === 'parts,lab,proving,place,weather,time,look,terrain' && panel.more.join() === 'probe:探针' && panel.built === 0, 'the tabs are not the eight and the probe');
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
    check(reported.length === 2, `the kernel's reports on the console: ${reported.length}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- B. the player's kept game: save, reload, new game
  {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(probe);
    const { page, errors, ready, rt, P } = await openPage(ctx, `${url}/modcar.html`);
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('modcar.save.v1') ?? 'null'));
    // (the page as it goes writes its save: stopped, so that what this script puts into the storage stays)
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
      await ready();
    };
    // (what the game said of itself: an hour of the clock may pass meanwhile, the page being live)
    const said = (q) => q.events.filter((e) => e[0].startsWith('game:')).map((e) => e[0]).join();
    let p = await P();
    console.log('a kept game', JSON.stringify({ events: p.events, firstSteps: p.dts.slice(0, 3) }));
    check((await page.evaluate(() => window.__rt.params.keep)) === true && said(p) === 'game:new', 'not a new kept game');

    // something to keep, three hours on, saved
    const c0 = (await rt('kernel')).clock;
    await page.evaluate(() => window.__rt.game.systems.harness('probe', 'bump', 7));
    await rt('setHour', c0.hour + 3);
    // (the save and the clock read in one go: the page is live, the clock goes on between two questions)
    const kept = await page.evaluate(() => {
      const g = window.__rt.game;
      g.save();
      return { clock: g.kernelTelemetry().clock, s: JSON.parse(localStorage.getItem('modcar.save.v1')) };
    });
    let s = kept.s;
    const c1 = kept.clock;
    console.log('saved', JSON.stringify({ slices: s.slices, clock: s.clock, hour: s.hour }));
    check(JSON.stringify(s.slices) === '{"probe":{"v":1,"d":{"value":7}}}', `the slice is not in the save: ${JSON.stringify(s.slices)}`);
    check(s.clock.day === 0 && close(s.clock.hour, s.hour, 1e-9) && close(s.clock.start, c0.startHour, 1e-12) && close((s.clock.hour - s.clock.start) * 3600, c1.worldSeconds, 1e-6), `the clock is not in the save: ${JSON.stringify(s.clock)}`);
    check(c1.worldSeconds > 10800 && c1.worldSeconds < 10800 + 600, `three hours on are not in the clock: ${c1.worldSeconds}`);

    // the page again, with a slice of a system that is not there in the save: the slice restored, the clock gone on, the stranger kept
    const ghost = { v: 3, d: { herds: [[1, 2, 3]], note: 'kept' } };
    await reloadWith(`s.slices.ghost = ${JSON.stringify(ghost)};`);
    p = await P();
    let k = await rt('kernel');
    console.log('reloaded', JSON.stringify({ value: p.value, restored: p.restored, events: p.events, clock: k.clock, slices: k.slices, firstSteps: p.dts.slice(0, 3) }));
    check(p.restored === 7 && p.value === 7 && p.init === 1, 'the slice did not come back');
    check(said(p) === 'game:restored', `the game did not say it was restored: ${JSON.stringify(p.events)}`);
    check(k.clock.day === 0 && close(k.clock.startHour, c0.startHour, 1e-12) && k.clock.worldSeconds >= c1.worldSeconds && k.clock.worldSeconds - c1.worldSeconds < 300, `the clock did not go on from the save: ${JSON.stringify(k.clock)} after ${c1.worldSeconds}`);
    check(k.slices.carried.join() === 'ghost' && k.lastError === '', `the stranger's slice is not carried quietly: ${JSON.stringify(k.slices)} ${k.lastError}`);
    await page.evaluate(() => window.__rt.game.save());
    s = await stored();
    check(JSON.stringify(s.slices.ghost) === JSON.stringify(ghost) && s.slices.probe.d.value === 7 && Object.keys(s.slices).join() === 'ghost,probe', `the stranger's slice is not in the next save as it came: ${JSON.stringify(s.slices)}`);
    const vehicles = await page.evaluate(() => window.__rt.game.vehicles.length);

    // a save from before there were slices and the clock: loads as it did
    await reloadWith('delete s.slices; delete s.clock;');
    p = await P();
    k = await rt('kernel');
    const old = await page.evaluate(() => ({ vehicles: window.__rt.game.vehicles.length, toast: document.querySelector('.mc-toast')?.textContent ?? '', hour: window.__rt.game.env.clock.hourAt(0) }));
    console.log('an old save', JSON.stringify({ value: p.value, cleared: p.cleared, events: p.events, clock: k.clock, old, firstSteps: p.dts.slice(0, 3) }));
    check(old.vehicles === vehicles && old.toast.startsWith('接着上次的进度'), 'the old save did not load as before');
    check(p.value === 0 && p.restored === null && p.cleared === 1 && said(p) === 'game:restored', 'its slices are not as a new game starts');
    check(k.clock.day === 0 && close(k.clock.startHour, old.hour, 1e-9) && k.clock.worldSeconds < 300 && k.lastError === '', `its clock does not begin at its hour: ${JSON.stringify(k.clock)}`);

    // F9 twice: a new game — the slice and the clock from the start
    await page.evaluate(() => window.__rt.game.systems.harness('probe', 'bump', 3));
    await page.evaluate(() => window.__rt.game.save());
    const loaded = page.waitForEvent('domcontentloaded', { timeout: 120_000 });
    await page.keyboard.press('F9');
    await page.keyboard.press('F9');
    await loaded;
    await page.waitForTimeout(500);
    await ready();
    p = await P();
    k = await rt('kernel');
    s = await stored();
    console.log('a new game', JSON.stringify({ value: p.value, events: p.events, clock: k.clock, saved: !!s, firstSteps: p.dts.slice(0, 3) }));
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
